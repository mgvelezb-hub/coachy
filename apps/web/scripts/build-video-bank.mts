/**
 * Banco de videos de ejercicios.
 *
 *   pnpm -F web exec tsx scripts/build-video-bank.mts \
 *     --chat <export.txt> --dir <carpeta-de-videos> [--dry-run]
 *
 * El coach manda por chat la rutina como una línea por ejercicio, cada una con
 * su video adjunto. El export del chat conserva el texto y la marca de tiempo,
 * pero no el archivo; los videos viven aparte con el sello de tiempo del envío
 * en el nombre (`VIDEO-YYYY-MM-DD-HH-MM-SS[ n].MP4`). Este guion vuelve a unir
 * ambas mitades y deja un banco de demostraciones listo para la app:
 *
 *   1. Parsea el export y se queda con las líneas que son rutina (llevan un
 *      patrón de series) y traían video.
 *   2. Escanea la carpeta de videos, deduplica por hash (el export del teléfono
 *      repite el mismo archivo con sufijos ` 2`, ` 3`, …) y ordena por sello de
 *      tiempo y sufijo.
 *   3. Empareja cada video con su línea de rutina por cercanía temporal
 *      (±`--tolerance` segundos, en orden). Lo que no case se reporta.
 *   4. Extrae el nombre del ejercicio (el texto antes del patrón de series),
 *      lo normaliza y se queda con UN video por ejercicio: el más pesado
 *      (mejor calidad); a igual peso, el más reciente.
 *   5. Recorta la selección al presupuesto (`--budget-mb`) tirando primero los
 *      ejercicios de nombre dudoso.
 *   6. Sube cada video al bucket privado (`--bucket`) en `library/{slug}.mp4` y
 *      apunta `exercises.video_url` a esa ruta de storage (NO una URL firmada:
 *      la app firma al vuelo con `signedExerciseVideoUrl`).
 *
 * Es idempotente: si el objeto ya está en storage con el mismo tamaño y la fila
 * ya apunta ahí, lo salta. Los videos nunca entran al repo.
 *
 * Variables de entorno necesarias (carga `apps/web/.env.local`):
 *   DATABASE_URL · NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { PrismaClient } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { EXERCISE_VIDEO_BUCKET, EXERCISE_VIDEO_PREFIX } from "@/lib/storage-paths";

// ---------------------------------------------------------------------------
// Opciones
// ---------------------------------------------------------------------------

interface Options {
  chat: string;
  dir: string;
  bucket: string;
  dryRun: boolean;
  budgetBytes: number;
  toleranceSeconds: number;
  createMissing: boolean;
  reportFile: string | null;
}

const USAGE = `
Uso:
  tsx scripts/build-video-bank.mts --chat <archivo.txt> --dir <carpeta> [opciones]

Opciones:
  --chat <archivo>     Export de texto del chat con las rutinas (obligatorio)
  --dir <carpeta>      Carpeta con los videos, se recorre en profundidad (obligatorio)
  --dry-run            Analiza y reporta, pero no sube nada ni toca la base
  --budget-mb <n>      Tope duro de MB a subir (default 700)
  --tolerance <seg>    Ventana ± para amarrar un video a su línea (default 3)
  --bucket <nombre>    Bucket privado destino (default ${EXERCISE_VIDEO_BUCKET})
  --no-create          No crea ejercicios nuevos, solo reporta los que faltan
  --report <archivo>   Escribe el reporte completo en JSON (rutas locales incluidas)
`.trim();

function parseArgs(argv: string[]): Options {
  const options: Options = {
    chat: "",
    dir: "",
    bucket: EXERCISE_VIDEO_BUCKET,
    dryRun: false,
    budgetBytes: 700 * 1024 * 1024,
    toleranceSeconds: 3,
    createMissing: true,
    reportFile: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`Falta el valor de ${arg}`);
      i += 1;
      return value;
    };

    switch (arg) {
      case "--chat":
        options.chat = next();
        break;
      case "--dir":
        options.dir = next();
        break;
      case "--bucket":
        options.bucket = next();
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--budget-mb":
        options.budgetBytes = Math.round(Number(next()) * 1024 * 1024);
        break;
      case "--tolerance":
        options.toleranceSeconds = Number(next());
        break;
      case "--no-create":
        options.createMissing = false;
        break;
      case "--report":
        options.reportFile = next();
        break;
      case "--help":
      case "-h":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`Opción desconocida: ${arg}\n\n${USAGE}`);
    }
  }

  if (!options.chat || !options.dir) throw new Error(USAGE);
  if (!Number.isFinite(options.budgetBytes) || options.budgetBytes <= 0) {
    throw new Error("--budget-mb debe ser un número positivo");
  }
  return options;
}

// ---------------------------------------------------------------------------
// Normalización de texto
// ---------------------------------------------------------------------------

/** Minúsculas, sin acentos, sin puntuación, espacios colapsados. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Slug ASCII estable para la ruta dentro del bucket. */
export function slugify(value: string): string {
  return normalizeName(value).replace(/\s+/g, "-").slice(0, 64);
}

// ---------------------------------------------------------------------------
// 1. Chat
// ---------------------------------------------------------------------------

interface ChatLine {
  at: Date;
  text: string;
  /** El renglón traía un adjunto de video. */
  hasVideo: boolean;
  claimedBy: number | null;
}

/** `[DD/MM/AA, H:MM:SS] Quien: texto` — el export mete marcas invisibles. */
const CHAT_HEADER =
  /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2}):(\d{2})\]\s*[^:]{1,60}:\s*(.*)$/;

const VIDEO_MARKERS = ["video omitted", "video omitido"];

/** Un renglón es rutina si trae un patrón de series/repeticiones. */
const SERIES_DETECT = /\d+\s*(?:series|serie|seres|seris|sets|set)\b/i;

/** Corta el nombre justo antes del patrón de series. */
const SERIES_CUT = /(?:^|\s)\d+\s*(?:series|serie|seres|seris|sets|set|reps|repeticiones|x)\b/i;

export function parseChat(raw: string): ChatLine[] {
  const clean = raw.replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "");
  const lines: ChatLine[] = [];

  for (const row of clean.split(/\r?\n/)) {
    const match = CHAT_HEADER.exec(row);
    if (!match) {
      // Continuación de un mensaje multilínea.
      const previous = lines[lines.length - 1];
      if (previous) previous.text += ` ${row.trim()}`;
      continue;
    }

    const [, day = "", month = "", year = "", hour = "", minute = "", second = "", text = ""] =
      match;
    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
    lines.push({
      at: new Date(
        fullYear,
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ),
      text,
      hasVideo: false,
      claimedBy: null,
    });
  }

  for (const line of lines) {
    const lowered = line.text.toLowerCase();
    line.hasVideo = VIDEO_MARKERS.some((marker) => lowered.includes(marker));
  }

  return lines;
}

/** Texto de rutina → nombre del ejercicio (vacío si el renglón no lo trae). */
export function exerciseNameFromLine(text: string): string {
  let body = text;
  for (const marker of VIDEO_MARKERS) {
    body = body.replace(new RegExp(marker, "gi"), " ");
  }

  const cut = SERIES_CUT.exec(body);
  if (cut) body = body.slice(0, cut.index);

  return body.replace(/\s+/g, " ").trim().replace(/^[\s.,:;-]+|[\s.,:;-]+$/g, "");
}

// ---------------------------------------------------------------------------
// 2. Videos
// ---------------------------------------------------------------------------

interface VideoFile {
  filePath: string;
  at: Date;
  /** Sufijo ` 2`, ` 3`, … del export; 1 cuando no lo trae. */
  order: number;
  size: number;
  hash: string;
}

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v"]);
const VIDEO_NAME = /^VIDEO-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})(?:\s+(\d+))?$/;

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
      continue;
    }
    if (VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha1");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * Escanea la carpeta y devuelve un archivo por contenido distinto. El export
 * del teléfono deja copias byte a byte con sufijos numéricos; contarlas como
 * envíos distintos desalinearía todo el emparejamiento.
 */
async function collectVideos(dir: string): Promise<{ videos: VideoFile[]; duplicates: number }> {
  const files = await walk(dir);
  const byHash = new Map<string, VideoFile>();
  let duplicates = 0;
  let unnamed = 0;

  for (const filePath of files) {
    const match = VIDEO_NAME.exec(path.parse(filePath).name);
    if (!match) {
      unnamed += 1;
      continue;
    }

    const [, year = "", month = "", day = "", hour = "", minute = "", second = "", order] = match;
    const [{ size }, hash] = await Promise.all([stat(filePath), hashFile(filePath)]);
    const video: VideoFile = {
      filePath,
      at: new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ),
      order: order ? Number(order) : 1,
      size,
      hash,
    };

    const seen = byHash.get(hash);
    if (!seen) {
      byHash.set(hash, video);
      continue;
    }
    duplicates += 1;
    // Nos quedamos con el sufijo más bajo: es el envío original.
    if (video.order < seen.order) byHash.set(hash, video);
  }

  if (unnamed > 0) {
    console.warn(`  ! ${unnamed} archivos con nombre fuera del patrón VIDEO-…, ignorados`);
  }

  const videos = [...byHash.values()].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || a.order - b.order,
  );
  return { videos, duplicates };
}

// ---------------------------------------------------------------------------
// 3. Emparejamiento video → línea de rutina
// ---------------------------------------------------------------------------

interface MappedVideo extends VideoFile {
  line: ChatLine | null;
  rawName: string;
  normalized: string;
}

function alignVideos(
  videos: VideoFile[],
  lines: ChatLine[],
  toleranceSeconds: number,
): MappedVideo[] {
  const routineLines = lines.filter((line) => line.hasVideo && SERIES_DETECT.test(line.text));
  const toleranceMs = toleranceSeconds * 1000;

  return videos.map((video, index) => {
    const match = routineLines.find(
      (line) =>
        line.claimedBy === null &&
        Math.abs(line.at.getTime() - video.at.getTime()) <= toleranceMs,
    );

    if (match) match.claimedBy = index;
    const rawName = match ? exerciseNameFromLine(match.text) : "";
    return { ...video, line: match ?? null, rawName, normalized: normalizeName(rawName) };
  });
}

// ---------------------------------------------------------------------------
// 4. Nombres dudosos
// ---------------------------------------------------------------------------

/**
 * Nombres demasiado genéricos para saber a qué ejercicio se refieren: son los
 * primeros en caer si la selección no cabe en el presupuesto.
 */
const AMBIGUOUS = new Set([
  "curl",
  "press",
  "jalon",
  "polea",
  "polea baja",
  "remo",
  "maquina",
  "aparato",
  "neutro",
  "barra",
  "mancuernas",
  "sentadilla",
]);

function isDubious(normalized: string): boolean {
  if (!normalized) return true;
  if (/^\d/.test(normalized)) return true;
  if (normalized.length < 4) return true;
  return AMBIGUOUS.has(normalized);
}

// ---------------------------------------------------------------------------
// 5. Catálogo: alias y grupo muscular
// ---------------------------------------------------------------------------

/**
 * Vocabulario de gimnasio: cómo se abrevia cada ejercicio en la rutina frente a
 * cómo se llama en el catálogo. Solo abreviaturas genéricas del deporte.
 */
const ALIASES: Record<string, string> = {
  prensa: "Prensa de pierna",
  hack: "Hack squat",
  "hack squat": "Hack squat",
  "leg extension": "Extensión de pierna (leg extension)",
  "leg extensión": "Extensión de pierna (leg extension)",
  "extension de pierna": "Extensión de pierna (leg extension)",
  "back squat": "Back squat en Smith",
  "back squat smith": "Back squat en Smith",
  "back squat sentadilla perfecta": "Back squat en Smith",
  "zumo squat": "Sentadilla sumo",
  "sumo squat": "Sentadilla sumo",
  "sentadilla sumo": "Sentadilla sumo",
  "sentadilla bulgara": "Sentadilla búlgara",
  jefferson: "Peso muerto Jefferson",
  "peso muerto rumano": "Peso muerto rumano",
  desplantes: "Desplantes caminando",
  "desplantes con barra olimpica": "Desplantes caminando",
  "curl acostado": "Curl femoral acostado",
  "curl prono femoral": "Curl femoral acostado",
  "curl sentado": "Curl femoral sentado",
  "curo sentado": "Curl femoral sentado",
  "curl parado": "Curl femoral parado",
  "press panto": "Press de pantorrilla",
  "press pantorrilla": "Press de pantorrilla",
  costurera: "Costurera (abductores)",
  abductores: "Abductores en máquina",
  aductores: "Aductores en máquina",
  "patada trasera": "Patada trasera en polea",
  "lateral polea": "Elevación lateral en polea",
  "laterales en polea": "Elevación lateral en polea",
  "lateral sentado": "Elevación lateral con mancuernas",
  laterales: "Elevación lateral con mancuernas",
  "press mancuernas": "Press militar con mancuernas",
  "press mancuerna hombro": "Press militar con mancuernas",
  "press hombro smith": "Press de hombro en Smith",
  trasnuca: "Press trasnuca",
  "jalon a barbilla": "Jalón a la barbilla (upright row)",
  "jalon a la barbilla": "Jalón a la barbilla (upright row)",
  "jalon barbilla": "Jalón a la barbilla (upright row)",
  "elevacion frontal": "Elevación frontal con disco",
  shrugs: "Encogimientos de trapecio (shrugs)",
  "shrugs con barra": "Encogimientos de trapecio (shrugs)",
  "encogimiento con barra para trapecio": "Encogimientos de trapecio (shrugs)",
  "encogimientos": "Encogimientos de trapecio (shrugs)",
  pajaros: "Pájaros (deltoide posterior)",
  "poleas hombro posterior": "Polea baja posterior",
  "polea baja posterior": "Polea baja posterior",
  "3 motion": "3 Motion de hombro",
  "aparato pecho": "Press en aparato de pecho",
  "press en aparato": "Press en aparato de pecho",
  "peco deck": "Peck deck",
  "peck deck": "Peck deck",
  cristos: "Cristos plano",
  "cristos inclinado": "Cristos inclinados",
  crossover: "Crossover en poleas",
  fondos: "Fondos en paralelas",
  "jalon v": "Jalón de tríceps con barra V",
  cuerda: "Jalón de tríceps con cuerda",
  "tricep cuerda": "Jalón de tríceps con cuerda",
  "curl bicep cuerda": "Curl en polea",
  "curl barra en polea": "Curl en polea",
  "curl barra plana en polea": "Curl en polea",
  predicador: "Curl predicador",
  martillo: "Curl martillo",
  martillos: "Curl martillo",
  scott: "Curl Scott",
  "barra z": "Curl con barra Z",
  "curl banco inclinado": "Curl en banco inclinado",
  "press frances": "Press francés",
  "press france s": "Press francés",
  "press frances mancuernas": "Press francés",
  "presa frances banco inclinado": "Press francés inclinado",
  "press frances banco inclinado": "Press francés inclinado",
  "press frances inclinado": "Press francés inclinado",
  "press tricep": "Press de tríceps en aparato",
  "press california": "Press California",
  "extension tricep polea baja": "Extensión de tríceps en polea baja",
  dominadas: "Dominadas asistidas",
  "remo mancuerna": "Remo con mancuerna",
  "remo abierto": "Remo abierto",
  "t bar row": "T-bar row",
  "jalon neutro": "Jalón neutro",
  "jalon frontal": "Jalón frontal",
  "jalon trasnuca": "Jalón trasnuca",
  pullover: "Pullover",
  lagartijas: "Lagartijas",
  "bench press": "Bench press",
  "bench press inclinado": "Bench press inclinado",
  "peso muerto": "Peso muerto",
  "hip thrust": "Hip thrust",
  plancha: "Plancha",
  abdomen: "Abdomen en máquina",
  crunch: "Crunch en colchoneta",
  "elevacion de piernas": "Elevación de piernas colgado",
  "fondos en banco": "Fondos en banco",
};

/** Grupo muscular inferido por palabra clave, para ejercicios nuevos. */
const MUSCLE_KEYWORDS: Array<[RegExp, string, string]> = [
  [/femoral|isquio/, "PIERNA", "femoral"],
  [/pantorrilla|panto|gemelo/, "PIERNA", "pantorrilla"],
  [/gluteo|hip thrust|patada|abductor|aductor|costurera/, "PIERNA", "gluteo"],
  [/squat|sentadilla|prensa|desplante|zancada|peso muerto|jefferson|leg|pierna|hack/, "PIERNA", "cuadriceps_compuesto"],
  [/lateral|hombro|deltoide|militar|trasnuca|pajaro|frontal|shrug|trapecio|encogimiento|3 motion/, "HOMBRO", "deltoide_lateral"],
  [/pecho|bench|cristo|peck|crossover|lagartija|pectoral/, "PECHO", "empuje_horizontal"],
  [/jalon frontal|jalon neutro|jalon trasnuca|remo|dominada|pullover|espalda|row|dorsal/, "ESPALDA", "jalon_vertical"],
  [/tricep|frances|california|fondos|copa/, "TRICEP", "extension_polea"],
  [/curl|bicep|predicador|martillo|scott/, "BICEP", "bicep_aislado"],
  [/abdomen|abdominal|crunch|plancha|oblicuo/, "ABDOMEN", "flexion_tronco"],
];

function inferMuscle(normalized: string): { muscleGroup: string; poolRole: string } | null {
  for (const [pattern, muscleGroup, poolRole] of MUSCLE_KEYWORDS) {
    if (pattern.test(normalized)) return { muscleGroup, poolRole };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 6. Emparejamiento con el catálogo
// ---------------------------------------------------------------------------

interface CatalogEntry {
  id: string;
  name: string;
  videoUrl: string | null;
  /** Formas normalizadas por las que se le puede reconocer. */
  variants: string[];
}

function catalogVariants(name: string): string[] {
  const variants = new Set<string>([normalizeName(name)]);
  const parenthetical = /\(([^)]+)\)/.exec(name);
  if (parenthetical) {
    variants.add(normalizeName(parenthetical[1] ?? ""));
    variants.add(normalizeName(name.replace(/\([^)]*\)/g, "")));
  }
  return [...variants].filter(Boolean);
}

type MatchKind = "exacto" | "alias" | "contenido" | "tokens";

interface CatalogMatch {
  entry: CatalogEntry;
  kind: MatchKind;
}

const STOPWORDS = new Set(["de", "del", "la", "el", "en", "con", "a", "los", "las", "y", "o", "para"]);

function contentTokens(normalized: string): string[] {
  return normalized.split(" ").filter((token) => token && !STOPWORDS.has(token));
}

function matchCatalog(normalized: string, catalog: CatalogEntry[]): CatalogMatch | null {
  if (!normalized) return null;

  // El nombre completo manda sobre todo lo demás.
  for (const entry of catalog) {
    if (normalizeName(entry.name) === normalized) return { entry, kind: "exacto" };
  }

  // Después el alias explícito: "abductores" es la máquina, aunque también sea
  // el paréntesis aclaratorio de otro ejercicio del catálogo.
  const aliasTarget = ALIASES[normalized];
  if (aliasTarget) {
    const aliasNormalized = normalizeName(aliasTarget);
    const entry = catalog.find((candidate) => candidate.variants.includes(aliasNormalized));
    if (entry) return { entry, kind: "alias" };
  }

  // Y hasta el final las formas alternas (el paréntesis, el nombre en inglés).
  for (const entry of catalog) {
    if (entry.variants.includes(normalized)) return { entry, kind: "exacto" };
  }

  const tokens = contentTokens(normalized);
  if (tokens.length === 0) return null;

  let best: { entry: CatalogEntry; kind: MatchKind; score: number } | null = null;

  for (const entry of catalog) {
    for (const variant of entry.variants) {
      const variantTokens = contentTokens(variant);
      if (variantTokens.length === 0) continue;

      const shared = tokens.filter((token) => variantTokens.includes(token));
      if (shared.length === 0) continue;

      const covers = shared.length === variantTokens.length || shared.length === tokens.length;
      const kind: MatchKind = covers ? "contenido" : "tokens";
      // Cobertura total en ambos sentidos manda; a igualdad, más tokens compartidos.
      const score =
        shared.length / Math.max(tokens.length, variantTokens.length) + (covers ? 1 : 0);

      if (!best || score > best.score) best = { entry, kind, score };
    }
  }

  // Un solo token compartido y sin cobertura completa es ruido, no un match.
  if (!best || best.score < 0.5) return null;
  return { entry: best.entry, kind: best.kind };
}

// ---------------------------------------------------------------------------
// Selección
// ---------------------------------------------------------------------------

interface Selection {
  normalized: string;
  rawName: string;
  video: MappedVideo;
  /** Cuántos videos distintos había para este ejercicio. */
  candidates: number;
  dubious: boolean;
  match: CatalogMatch | null;
  targetName: string;
  slug: string;
}

function selectOnePerExercise(mapped: MappedVideo[]): Map<string, { best: MappedVideo; count: number }> {
  const groups = new Map<string, { best: MappedVideo; count: number }>();

  for (const video of mapped) {
    if (!video.normalized) continue;
    const group = groups.get(video.normalized);
    if (!group) {
      groups.set(video.normalized, { best: video, count: 1 });
      continue;
    }
    group.count += 1;
    const better =
      video.size > group.best.size ||
      (video.size === group.best.size && video.at.getTime() > group.best.at.getTime());
    if (better) group.best = video;
  }

  return groups;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

async function ensureBucket(supabase: SupabaseClient, bucket: string): Promise<void> {
  const { data } = await supabase.storage.getBucket(bucket);
  if (data) return;

  const { error } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 64 * 1024 * 1024,
    allowedMimeTypes: ["video/mp4", "video/quicktime"],
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`No se pudo crear el bucket ${bucket}: ${error.message}`);
  }
  console.log(`  · bucket privado ${bucket} creado`);
}

async function objectSize(
  supabase: SupabaseClient,
  bucket: string,
  key: string,
): Promise<number | null> {
  const folder = path.posix.dirname(key);
  const base = path.posix.basename(key);
  const { data } = await supabase.storage.from(bucket).list(folder, { search: base, limit: 100 });
  const found = data?.find((item) => item.name === base);
  if (!found) return null;
  const size = (found.metadata as { size?: number } | null)?.size;
  return typeof size === "number" ? size : 0;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!options.dryRun && (!supabaseUrl || !serviceRoleKey)) {
    throw new Error(
      [
        "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.",
        "Cárgalas antes de correr, desde apps/web:",
        "    set -a && . ./.env.local && set +a",
      ].join("\n"),
    );
  }

  console.log("Leyendo el chat…");
  const lines = parseChat(await readFile(options.chat, "utf8"));
  const routineLines = lines.filter((line) => line.hasVideo && SERIES_DETECT.test(line.text));
  console.log(`  · ${lines.length} mensajes, ${routineLines.length} renglones de rutina con video`);

  console.log("Escaneando videos…");
  const { videos, duplicates } = await collectVideos(options.dir);
  const totalBytes = videos.reduce((sum, video) => sum + video.size, 0);
  console.log(
    `  · ${videos.length} videos únicos (${formatMb(totalBytes)}), ${duplicates} copias descartadas`,
  );

  const mapped = alignVideos(videos, lines, options.toleranceSeconds);
  const unmapped = mapped.filter((video) => !video.line || !video.normalized);
  console.log(`  · ${mapped.length - unmapped.length} mapeados, ${unmapped.length} sin mapear`);

  const prisma = new PrismaClient();
  const catalogRows = await prisma.exercise.findMany({
    select: { id: true, name: true, videoUrl: true },
    orderBy: { name: "asc" },
  });
  const catalog: CatalogEntry[] = catalogRows.map((row) => ({
    ...row,
    variants: catalogVariants(row.name),
  }));
  console.log(`  · catálogo: ${catalog.length} ejercicios`);

  const groups = selectOnePerExercise(mapped);
  const selections: Selection[] = [];
  const discarded: Array<{ rawName: string; guess: string | null }> = [];

  for (const [normalized, group] of groups) {
    const match = matchCatalog(normalized, catalog);
    const dubious = isDubious(normalized) || (!match && !inferMuscle(normalized));

    // Un nombre genérico ("curl", "polea baja") solo cuenta si cayó en un
    // ejercicio por su nombre completo o por un alias del catálogo; adivinar
    // por parecido de palabras ahí es rifar a qué ejercicio le cuelga el video.
    if (dubious && match?.kind !== "exacto" && match?.kind !== "alias") {
      discarded.push({ rawName: group.best.rawName, guess: match?.entry.name ?? null });
      continue;
    }

    const targetName = match?.entry.name ?? group.best.rawName;
    selections.push({
      normalized,
      rawName: group.best.rawName,
      video: group.best,
      candidates: group.count,
      dubious,
      match,
      targetName,
      slug: slugify(targetName),
    });
  }

  // Un mismo ejercicio del catálogo puede recibir dos nombres del chat
  // ("curl sentado" y "curo sentado"): se queda el video más pesado.
  const byTarget = new Map<string, Selection>();
  const collapsed: Selection[] = [];
  for (const selection of selections.sort((a, b) => b.video.size - a.video.size)) {
    const key = selection.match?.entry.id ?? `nuevo:${selection.slug}`;
    if (byTarget.has(key)) {
      collapsed.push(selection);
      continue;
    }
    byTarget.set(key, selection);
  }

  // Presupuesto: primero los seguros, después los dudosos; se corta al llegar.
  const ordered = [...byTarget.values()].sort((a, b) => {
    if (a.dubious !== b.dubious) return a.dubious ? 1 : -1;
    if (Boolean(a.match) !== Boolean(b.match)) return a.match ? -1 : 1;
    return b.video.size - a.video.size;
  });

  const keep: Selection[] = [];
  const trimmed: Selection[] = [];
  let budgetUsed = 0;
  for (const selection of ordered) {
    if (budgetUsed + selection.video.size <= options.budgetBytes) {
      keep.push(selection);
      budgetUsed += selection.video.size;
      continue;
    }
    trimmed.push(selection);
  }

  console.log("");
  console.log(`Ejercicios distintos detectados: ${groups.size}`);
  console.log(`  · descartados por nombre demasiado genérico: ${discarded.length}`);
  console.log(`  · nombres que colapsan al mismo ejercicio: ${collapsed.length}`);
  console.log(`  · seleccionados: ${keep.length} (${formatMb(budgetUsed)})`);
  console.log(`  · recortados por presupuesto: ${trimmed.length}`);
  console.log(`  · con match en el catálogo: ${keep.filter((item) => item.match).length}`);
  console.log(`  · por crear: ${keep.filter((item) => !item.match).length}`);
  console.log(`  · nombre dudoso: ${keep.filter((item) => item.dubious).length}`);
  console.log("");

  const supabase =
    supabaseUrl && serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
      : null;

  if (supabase && !options.dryRun) await ensureBucket(supabase, options.bucket);

  let uploaded = 0;
  let skippedUpload = 0;
  let updated = 0;
  let created = 0;
  const failures: Array<{ name: string; error: string }> = [];

  for (const selection of keep) {
    const key = `${EXERCISE_VIDEO_PREFIX}/${selection.slug}.mp4`;
    const storagePath = `${options.bucket}/${key}`;
    const label = `${selection.targetName} [${selection.match?.kind ?? "nuevo"}]`;

    if (options.dryRun) {
      console.log(`  (dry-run) ${label} → ${key} (${formatMb(selection.video.size)})`);
      continue;
    }
    if (!supabase) throw new Error("Sin cliente de Supabase");

    const existing = await objectSize(supabase, options.bucket, key);
    if (existing === selection.video.size) {
      skippedUpload += 1;
    } else {
      const body = await readFile(selection.video.filePath);
      const { error } = await supabase.storage
        .from(options.bucket)
        .upload(key, body, { contentType: "video/mp4", upsert: true });
      if (error) {
        failures.push({ name: selection.targetName, error: error.message });
        continue;
      }
      uploaded += 1;
    }

    if (selection.match) {
      if (selection.match.entry.videoUrl === storagePath) continue;
      await prisma.exercise.update({
        where: { id: selection.match.entry.id },
        data: { videoUrl: storagePath },
      });
      updated += 1;
      continue;
    }

    if (!options.createMissing) continue;
    const inferred = inferMuscle(selection.normalized);
    if (!inferred) continue;

    await prisma.exercise.create({
      data: {
        name: selection.targetName,
        muscleGroup: inferred.muscleGroup,
        poolRole: inferred.poolRole,
        videoUrl: storagePath,
        substitutes: [],
      },
    });
    created += 1;
  }

  const withVideo = await prisma.exercise.count({ where: { videoUrl: { not: null } } });

  console.log("");
  console.log("Resultado");
  console.log(`  · subidos: ${uploaded} · ya estaban: ${skippedUpload} · fallidos: ${failures.length}`);
  console.log(`  · exercises actualizados: ${updated} · creados: ${created}`);
  console.log(`  · exercises con video_url: ${withVideo}`);
  for (const failure of failures) console.log(`  ! ${failure.name}: ${failure.error}`);

  console.log("");
  console.log("Sin mapear (video sin renglón de rutina reconocible):");
  const byMonth = new Map<string, number>();
  for (const video of unmapped) {
    const month = video.at.toISOString().slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }
  for (const [month, count] of [...byMonth.entries()].sort()) {
    console.log(`  · ${month}: ${count}`);
  }

  if (options.reportFile) {
    await writeFile(
      options.reportFile,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          totals: {
            videosUnicos: videos.length,
            duplicados: duplicates,
            mapeados: mapped.length - unmapped.length,
            sinMapear: unmapped.length,
            ejerciciosDistintos: groups.size,
            seleccionados: keep.length,
            bytesSeleccionados: budgetUsed,
          },
          seleccion: keep.map((item) => ({
            ejercicio: item.targetName,
            desdeElChat: item.rawName,
            match: item.match?.kind ?? null,
            dudoso: item.dubious,
            candidatos: item.candidates,
            bytes: item.video.size,
            ruta: `${options.bucket}/${EXERCISE_VIDEO_PREFIX}/${item.slug}.mp4`,
          })),
          recortados: trimmed.map((item) => ({ ejercicio: item.targetName, bytes: item.video.size })),
          descartados: discarded,
          colapsados: collapsed.map((item) => ({ nombre: item.rawName, hacia: item.targetName })),
          sinMapear: unmapped.map((item) => ({
            archivo: path.basename(item.filePath),
            texto: item.line?.text ?? null,
          })),
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`\nReporte en ${options.reportFile}`);
  }

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
