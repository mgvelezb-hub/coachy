/**
 * Backfill de fotos históricas de progreso.
 *
 *   pnpm -F web exec tsx scripts/backfill-photos.mts \
 *     --dir <carpeta> --athlete-email <email> [--dry-run]
 *
 * La carpeta tiene subcarpetas `YYYY-MM-DD` con los archivos `.jpg` de esa
 * tanda. Para cada fecha el guion busca el check-in del atleta más cercano
 * dentro de una ventana de días; si no hay ninguno libre, crea un check-in
 * esqueleto con valores neutros para que la foto quede anclada a una fecha.
 *
 * Cada foto se clasifica por VISTA (frente / perfil / espalda) con la API de
 * Anthropic. El modelo solo puede contestar con la postura: no analiza, no
 * describe y no opina sobre el cuerpo de nadie. Después el archivo se sube al
 * bucket privado con service role y se inserta la fila en `photos`.
 *
 * Es idempotente: si ya existe una foto con la misma ruta, la salta. Las fotos
 * nunca entran al repo; solo viven en Supabase Storage.
 *
 * Variables de entorno necesarias (carga `apps/web/.env.local`):
 *   DATABASE_URL · NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY ·
 *   ANTHROPIC_API_KEY
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient, type PhotoView } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { PHOTO_BUCKET } from "@/lib/env";
import { PHOTO_VIEWS } from "@/lib/validation/checkin";

// ---------------------------------------------------------------------------
// Opciones
// ---------------------------------------------------------------------------

interface Options {
  dir: string;
  athleteEmail: string;
  dryRun: boolean;
  windowDays: number;
  model: string;
  cacheFile: string | null;
}

const USAGE = `
Uso:
  tsx scripts/backfill-photos.mts --dir <carpeta> --athlete-email <email> [opciones]

Opciones:
  --dir <carpeta>          Carpeta con subcarpetas YYYY-MM-DD de fotos (obligatorio)
  --athlete-email <email>  Email del atleta dueño de las fotos (obligatorio)
  --dry-run                Hace todo menos subir, insertar y crear check-ins
  --window-days <n>        Ventana ± para amarrar una tanda a un check-in (default 6)
  --model <id>             Modelo de clasificación (default claude-haiku-4-5)
  --cache <archivo.json>   Guarda/reusa las clasificaciones para no pagarlas dos veces
`.trim();

function parseArgs(argv: string[]): Options {
  const options: Options = {
    dir: "",
    athleteEmail: "",
    dryRun: false,
    windowDays: 6,
    model: process.env.BACKFILL_PHOTO_MODEL ?? "claude-haiku-4-5",
    cacheFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    switch (flag) {
      case "--dir":
        options.dir = value ?? "";
        index += 1;
        break;
      case "--athlete-email":
        options.athleteEmail = value ?? "";
        index += 1;
        break;
      case "--window-days":
        options.windowDays = Number(value ?? "6");
        index += 1;
        break;
      case "--model":
        options.model = value ?? options.model;
        index += 1;
        break;
      case "--cache":
        options.cacheFile = value ?? null;
        index += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        fail(`Opción desconocida: ${flag}\n\n${USAGE}`);
    }
  }

  if (!options.dir) fail(`Falta --dir\n\n${USAGE}`);
  if (!options.athleteEmail) fail(`Falta --athlete-email\n\n${USAGE}`);
  if (!Number.isFinite(options.windowDays) || options.windowDays < 0) {
    fail("--window-days tiene que ser un número de días ≥ 0");
  }

  return options;
}

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    fail(
      `Falta la variable de entorno ${name}. Cárgala con:\n` +
        `    set -a && . ./.env.local && set +a`,
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;
const PHOTO_FILE = /\.jpe?g$/i;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function daysApart(a: string, b: string): number {
  return Math.round(Math.abs(fromISODate(a).getTime() - fromISODate(b).getTime()) / MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Clasificación de vista
// ---------------------------------------------------------------------------

const VIEW_TOOL_NAME = "registrar_vista";

const VIEW_TOOL: Anthropic.Tool = {
  name: VIEW_TOOL_NAME,
  description: "Registra desde qué ángulo está tomada la foto de progreso.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      view: {
        type: "string",
        enum: [...PHOTO_VIEWS],
        description:
          "FRENTE si la persona mira a la cámara, PERFIL si está de lado, ESPALDA si está de espaldas.",
      },
    },
    required: ["view"],
  },
};

const CLASSIFY_SYSTEM = `Clasificas fotos de progreso por el ÁNGULO desde el que están tomadas.

Elige exactamente una opción según la postura del cuerpo respecto a la cámara:
- FRENTE: el torso está de frente a la cámara.
- PERFIL: el torso está de lado (izquierdo o derecho).
- ESPALDA: el torso está de espaldas a la cámara.

Si dudas entre dos, elige la que describa hacia dónde apuntan los hombros y el ombligo.

PROHIBIDO ABSOLUTAMENTE:
- describir a la persona, su cuerpo, su rostro, su ropa o el lugar;
- opinar sobre apariencia, peso, grasa, músculo, progreso o salud;
- cualquier comentario, nota o texto adicional.

Tu única salida es la llamada a la herramienta con el campo view.`;

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.RateLimitError) return true;
  if (error instanceof Anthropic.APIConnectionError) return true;
  if (error instanceof Anthropic.APIError) return (error.status ?? 500) >= 500;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPhotoView(value: unknown): value is PhotoView {
  return typeof value === "string" && (PHOTO_VIEWS as readonly string[]).includes(value);
}

/** Pide la vista al modelo. Reintenta con backoff ante 429 / 5xx / red. */
async function classifyView(
  client: Anthropic,
  model: string,
  filePath: string,
): Promise<PhotoView> {
  const data = readFileSync(filePath).toString("base64");
  const attempts = 5;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 256,
        system: CLASSIFY_SYSTEM,
        tools: [VIEW_TOOL],
        tool_choice: { type: "tool", name: VIEW_TOOL_NAME },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
              { type: "text", text: "¿Desde qué ángulo está tomada esta foto?" },
            ],
          },
        ],
      });

      for (const block of response.content) {
        if (block.type !== "tool_use" || block.name !== VIEW_TOOL_NAME) continue;
        const view = (block.input as { view?: unknown }).view;
        if (isPhotoView(view)) return view;
      }

      throw new Error("el modelo no devolvió una vista válida");
    } catch (error) {
      // Reintenta lo transitorio (429, 5xx, red) y las respuestas mal formadas;
      // un 400 o un 401 no mejoran esperando.
      const retry = isRetryable(error) || !(error instanceof Anthropic.APIError);
      if (attempt === attempts || !retry) throw error;
      const waitMs = Math.min(30_000, 2 ** attempt * 1_000);
      console.warn(
        `    · reintento ${attempt}/${attempts - 1} en ${waitMs / 1000}s ` +
          `(${error instanceof Error ? error.message : String(error)})`,
      );
      await sleep(waitMs);
    }
  }

  throw new Error(`no se pudo clasificar ${path.basename(filePath)}`);
}

// ---------------------------------------------------------------------------
// Caché de clasificaciones
// ---------------------------------------------------------------------------

type ViewCache = Record<string, PhotoView>;

function loadCache(file: string | null): ViewCache {
  if (!file || !existsSync(file)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object") return {};
    const cache: ViewCache = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isPhotoView(value)) cache[key] = value;
    }
    return cache;
  } catch {
    return {};
  }
}

function saveCache(file: string | null, cache: ViewCache): void {
  if (!file) return;
  writeFileSync(file, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

// ---------------------------------------------------------------------------
// Reparto de tandas → check-ins
// ---------------------------------------------------------------------------

interface CheckInRef {
  id: string;
  date: string;
}

interface Batch {
  /** Fecha de la carpeta, `YYYY-MM-DD`. */
  date: string;
  files: string[];
  /** Check-in existente al que se amarra la tanda; null = hay que crearlo. */
  checkIn: CheckInRef | null;
}

/**
 * Amarra cada tanda a un check-in distinto:
 *   1. coincidencia exacta de fecha;
 *   2. el check-in libre más cercano dentro de la ventana;
 *   3. si no queda ninguno, la tanda estrena check-in esqueleto.
 */
function assignCheckIns(batches: Batch[], checkIns: CheckInRef[], windowDays: number): void {
  const claimed = new Set<string>();
  const byDate = new Map(checkIns.map((checkIn) => [checkIn.date, checkIn]));

  for (const batch of batches) {
    const exact = byDate.get(batch.date);
    if (exact && !claimed.has(exact.id)) {
      batch.checkIn = exact;
      claimed.add(exact.id);
    }
  }

  const candidates: Array<{ batch: Batch; checkIn: CheckInRef; distance: number }> = [];
  for (const batch of batches) {
    if (batch.checkIn) continue;
    for (const checkIn of checkIns) {
      const distance = daysApart(batch.date, checkIn.date);
      if (distance <= windowDays) candidates.push({ batch, checkIn, distance });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance || a.batch.date.localeCompare(b.batch.date));

  for (const candidate of candidates) {
    if (candidate.batch.checkIn || claimed.has(candidate.checkIn.id)) continue;
    candidate.batch.checkIn = candidate.checkIn;
    claimed.add(candidate.checkIn.id);
  }
}

const SKELETON_COMMENT = "Check-in histórico creado por backfill de fotos";

/** Check-in mínimo para anclar fotos de una fecha sin registro: todo neutro. */
function skeletonCheckIn(userId: string, date: string) {
  return {
    userId,
    date: fromISODate(date),
    inflammation: 3,
    energy: 3,
    hunger: 3,
    satiety: 3,
    sleep: 3,
    dietCompliance: 100,
    trainingCompliance: 100,
    symptoms: [],
    comment: SKELETON_COMMENT,
  };
}

// ---------------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------------

function storageKey(userId: string, checkInId: string, view: PhotoView, index: number): string {
  return `${userId}/${checkInId}/${view.toLowerCase()}-${index}.jpg`;
}

async function uploadPhoto(
  supabase: SupabaseClient,
  key: string,
  filePath: string,
): Promise<{ ok: true; already: boolean } | { ok: false; error: string }> {
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(key, readFileSync(filePath), { contentType: "image/jpeg", upsert: false });

  if (!error) return { ok: true, already: false };

  // El objeto ya estaba: no es un fallo, es una corrida repetida.
  const duplicate =
    "statusCode" in error && String((error as { statusCode?: unknown }).statusCode) === "409";
  if (duplicate || /already exists|duplicate/i.test(error.message)) {
    return { ok: true, already: true };
  }

  return { ok: false, error: error.message };
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

interface BatchReport {
  date: string;
  checkInDate: string;
  created: boolean;
  uploaded: Partial<Record<PhotoView, number>>;
  skipped: Array<{ file: string; reason: string }>;
  errors: Array<{ file: string; error: string }>;
}

const REASON_ALREADY = "ya existía en photos";
const REASON_DUPLICATE_VIEW = "vista repetida en la tanda (photos es única por check-in+vista)";

function printSummary(reports: BatchReport[], dryRun: boolean): void {
  const header = dryRun ? "PLAN (dry-run)" : "RESULTADO";
  console.log(`\n${"─".repeat(72)}\n${header}\n${"─".repeat(72)}`);

  let uploaded = 0;
  let skipped = 0;
  let errors = 0;
  let created = 0;
  const byView: Partial<Record<PhotoView, number>> = {};

  for (const report of reports) {
    const views = PHOTO_VIEWS.map((view) => {
      const count = report.uploaded[view] ?? 0;
      return count > 0 ? `${view.toLowerCase()}×${count}` : null;
    })
      .filter((label): label is string => label !== null)
      .join(" ");

    const anchor = report.created
      ? `check-in CREADO ${report.checkInDate}`
      : `check-in ${report.checkInDate}`;

    console.log(
      `${report.date}  ${anchor.padEnd(28)} ${views || "—"}` +
        (report.skipped.length > 0 ? `  · ${report.skipped.length} saltadas` : "") +
        (report.errors.length > 0 ? `  · ${report.errors.length} con error` : ""),
    );

    for (const view of PHOTO_VIEWS) {
      const count = report.uploaded[view] ?? 0;
      if (count === 0) continue;
      uploaded += count;
      byView[view] = (byView[view] ?? 0) + count;
    }
    skipped += report.skipped.length;
    errors += report.errors.length;
    if (report.created) created += 1;
  }

  console.log(`${"─".repeat(72)}`);
  console.log(
    `Tandas: ${reports.length} · check-ins creados: ${created} · ` +
      `fotos: ${uploaded} (${PHOTO_VIEWS.map((view) => `${view.toLowerCase()} ${byView[view] ?? 0}`).join(" · ")})` +
      ` · saltadas: ${skipped} · errores: ${errors}`,
  );

  const withSkips = reports.filter((report) => report.skipped.length > 0);
  if (withSkips.length > 0) {
    console.log("\nSaltadas:");
    for (const report of withSkips) {
      for (const skip of report.skipped) {
        console.log(`  ${report.date}  ${skip.file} — ${skip.reason}`);
      }
    }
  }

  const withErrors = reports.filter((report) => report.errors.length > 0);
  if (withErrors.length > 0) {
    console.log("\nErrores:");
    for (const report of withErrors) {
      for (const problem of report.errors) {
        console.log(`  ${report.date}  ${problem.file} — ${problem.error}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  requireEnv("DATABASE_URL");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  requireEnv("ANTHROPIC_API_KEY");

  const dir = path.resolve(options.dir);
  if (!existsSync(dir)) fail(`No existe la carpeta ${dir}`);

  const batches: Batch[] = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && DATE_DIR.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((date) => ({
      date,
      files: readdirSync(path.join(dir, date))
        .filter((file) => PHOTO_FILE.test(file))
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
      checkIn: null,
    }))
    .filter((batch) => batch.files.length > 0);

  if (batches.length === 0) fail(`No hay subcarpetas YYYY-MM-DD con fotos en ${dir}`);

  const prisma = new PrismaClient();

  try {
    const athlete = await prisma.user.findFirst({
      where: { email: { equals: options.athleteEmail, mode: "insensitive" } },
      include: { profile: true },
    });

    if (!athlete) fail(`No hay ningún usuario con el email indicado.`);
    if (!athlete.profile) fail("El atleta no tiene perfil: primero termina el onboarding.");
    if (!athlete.profile.photoConsentAt) {
      fail(
        "El atleta no tiene consentimiento de fotos registrado (photo_consent_at nulo). " +
          "No se sube nada.",
      );
    }

    const existing = await prisma.checkIn.findMany({
      where: { userId: athlete.id },
      orderBy: { date: "asc" },
      select: { id: true, date: true },
    });

    assignCheckIns(
      batches,
      existing.map((checkIn) => ({ id: checkIn.id, date: toISODate(checkIn.date) })),
      options.windowDays,
    );

    const totalFiles = batches.reduce((sum, batch) => sum + batch.files.length, 0);
    console.log(
      `Atleta con consentimiento del ${toISODate(athlete.profile.photoConsentAt)} · ` +
        `${existing.length} check-ins · ${batches.length} tandas · ${totalFiles} fotos` +
        (options.dryRun ? " · DRY-RUN" : ""),
    );

    const anthropic = new Anthropic({ maxRetries: 3, timeout: 120_000 });
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const cache = loadCache(options.cacheFile);
    const reports: BatchReport[] = [];

    for (const batch of batches) {
      const report: BatchReport = {
        date: batch.date,
        checkInDate: batch.checkIn?.date ?? batch.date,
        created: batch.checkIn === null,
        uploaded: {},
        skipped: [],
        errors: [],
      };
      reports.push(report);

      console.log(
        `\n${batch.date} · ${batch.files.length} foto(s) → ` +
          (batch.checkIn ? `check-in ${batch.checkIn.date}` : "check-in nuevo (esqueleto)"),
      );

      let checkInId = batch.checkIn?.id ?? null;

      if (!checkInId && !options.dryRun) {
        const created = await prisma.checkIn.create({
          data: skeletonCheckIn(athlete.id, batch.date),
          select: { id: true },
        });
        checkInId = created.id;
      }

      const taken = new Set<PhotoView>();
      const knownPaths = new Set<string>();
      const perView: Partial<Record<PhotoView, number>> = {};

      if (checkInId) {
        const photos = await prisma.photo.findMany({
          where: { checkInId },
          select: { view: true, storagePath: true },
        });
        for (const photo of photos) {
          taken.add(photo.view);
          knownPaths.add(photo.storagePath);
        }
      }

      for (const file of batch.files) {
        const filePath = path.join(dir, batch.date, file);
        const cacheKey = `${batch.date}/${file}`;

        let view = cache[cacheKey];
        if (!view) {
          try {
            view = await classifyView(anthropic, options.model, filePath);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            report.errors.push({ file, error: `clasificación: ${message}` });
            console.log(`  ✗ ${file} — no se pudo clasificar (${message})`);
            continue;
          }
          cache[cacheKey] = view;
          saveCache(options.cacheFile, cache);
        }

        const index = (perView[view] ?? 0) + 1;
        perView[view] = index;

        // `checkInId` solo es null en dry-run con check-in por crear; ahí la
        // ruta se calcula contra un marcador para poder enseñar el plan.
        const key = storageKey(athlete.id, checkInId ?? "<nuevo-checkin>", view, index);

        if (knownPaths.has(key)) {
          report.skipped.push({ file, reason: REASON_ALREADY });
          console.log(`  = ${file} → ${view} (${REASON_ALREADY})`);
          continue;
        }

        if (taken.has(view)) {
          report.skipped.push({ file, reason: REASON_DUPLICATE_VIEW });
          console.log(`  – ${file} → ${view} (${REASON_DUPLICATE_VIEW})`);
          continue;
        }

        if (options.dryRun) {
          taken.add(view);
          report.uploaded[view] = (report.uploaded[view] ?? 0) + 1;
          console.log(`  + ${file} → ${view}`);
          continue;
        }

        if (!checkInId) {
          report.errors.push({ file, error: "no se pudo resolver el check-in" });
          continue;
        }

        const upload = await uploadPhoto(supabase, key, filePath);
        if (!upload.ok) {
          report.errors.push({ file, error: `subida: ${upload.error}` });
          console.log(`  ✗ ${file} → ${view} (no se pudo subir: ${upload.error})`);
          continue;
        }

        try {
          await prisma.photo.create({ data: { checkInId, view, storagePath: key } });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          report.errors.push({ file, error: `insert: ${message}` });
          console.log(`  ✗ ${file} → ${view} (no se pudo insertar)`);
          continue;
        }

        taken.add(view);
        knownPaths.add(key);
        report.uploaded[view] = (report.uploaded[view] ?? 0) + 1;
        console.log(`  + ${file} → ${view}${upload.already ? " (objeto ya estaba)" : ""}`);
      }
    }

    saveCache(options.cacheFile, cache);
    printSummary(reports, options.dryRun);

    if (options.dryRun) {
      console.log("\nDry-run: no se subió, insertó ni creó nada.\n");
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();
