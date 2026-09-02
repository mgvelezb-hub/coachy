/**
 * Sube el reemplazo de videos con licencia libre generado fuera del repo y
 * actualiza `exercises` (video_url + atribución) por NOMBRE de ejercicio.
 *
 * Contexto: los videos anteriores eran clips privados del coach, y el dueño
 * reportó que varios estaban mal clasificados. La limpieza no reclasificó los
 * clips viejos — los reemplazó por completo con material de licencia
 * verificada (wger.de, CC BY-SA 4.0; free-exercise-db, dominio público),
 * emparejado contra el catálogo por el NOMBRE del ejercicio, nunca por el
 * `video_url` que tenía la fila (ese era justo el dato corrupto).
 *
 * Este guion NO decide qué video le toca a cada ejercicio — eso ya está
 * resuelto en `manifest.json` (una investigación aparte, con la fuente, la
 * licencia y el nivel de confianza de cada match). Aquí solo se sube el
 * archivo y se escribe la fila.
 *
 * Uso (desde apps/web, con las credenciales de Supabase cargadas):
 *
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/subir-videos-libres.ts \
 *     --manifest /ruta/a/manifest.json \
 *     --videos-dir /ruta/a/videos-final
 *
 * `--manifest` es el JSON con un array de
 *   { slug, exerciseName, catalogo, source, license, licenseAuthor, matched }
 * y `--videos-dir` la carpeta con un `{slug}.mp4` por cada entrada con
 * `matched: true`. Solo actualiza `exercises` (catálogo de gimnasio); las
 * demás disciplinas (funcional, crossfit, running, …) no viven en la base —
 * su `videoPath` se llenó a mano en `apps/mobile/src/lib/tecnica/*.ts`.
 *
 * Variables de entorno necesarias: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Idempotente: sube con `upsert: true` y compara el tamaño antes de repetir
 * la subida; el update de la fila siempre corre (para poder corregir
 * atribución sin tener que volver a subir el archivo).
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

import { EXERCISE_VIDEO_BUCKET, EXERCISE_VIDEO_PREFIX } from "@/lib/storage-paths";

interface ManifestEntry {
  slug: string;
  exerciseName: string;
  catalogo: string;
  tecnicaId: string | null;
  source: "wger" | "free-exercise-db" | null;
  sourceUrl?: string;
  license?: string;
  licenseAuthor?: string | null;
  matchedName?: string | null;
  matchConfidence?: "alta" | "media";
  matched: boolean;
}

interface Options {
  manifestPath: string;
  videosDir: string;
  dryRun: boolean;
}

const USAGE = `
Uso:
  npx tsx scripts/subir-videos-libres.ts --manifest <archivo.json> --videos-dir <carpeta> [--dry-run]
`.trim();

function parseArgs(argv: string[]): Options {
  const options: Options = { manifestPath: "", videosDir: "", dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`Falta el valor de ${arg}`);
      i += 1;
      return value;
    };
    switch (arg) {
      case "--manifest":
        options.manifestPath = next();
        break;
      case "--videos-dir":
        options.videosDir = next();
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
        throw new Error(`Opción desconocida: ${arg}\n\n${USAGE}`);
    }
  }
  if (!options.manifestPath || !options.videosDir) throw new Error(USAGE);
  return options;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!options.dryRun && (!supabaseUrl || !serviceRoleKey)) {
    throw new Error(
      [
        "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.",
        "Cárgalas antes de correr, desde apps/web:",
        "    set -a && source .env.local && set +a",
      ].join("\n"),
    );
  }

  const manifest: ManifestEntry[] = JSON.parse(await readFile(options.manifestPath, "utf8"));
  // Solo nos interesa el catálogo de gimnasio: es el único que vive en la
  // tabla `exercises`. Las demás disciplinas se llenan directo en el código
  // (ver docblock arriba) porque no tienen tabla propia.
  const gymMatched = manifest.filter((entry) => entry.catalogo === "gym" && entry.matched);
  console.log(`Manifest: ${manifest.length} entradas · ${gymMatched.length} de gimnasio con match`);

  const supabase =
    supabaseUrl && serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
      : null;
  const prisma = new PrismaClient();

  let uploaded = 0;
  let skippedUpload = 0;
  let updated = 0;
  let notFoundInDb = 0;
  const failures: Array<{ name: string; error: string }> = [];

  for (const entry of gymMatched) {
    const localFile = path.join(options.videosDir, `${entry.slug}.mp4`);
    const key = `${EXERCISE_VIDEO_PREFIX}/${entry.slug}.mp4`;
    const storagePath = `${EXERCISE_VIDEO_BUCKET}/${key}`;

    let size: number;
    try {
      size = (await stat(localFile)).size;
    } catch {
      failures.push({ name: entry.exerciseName, error: `no existe ${localFile}` });
      continue;
    }

    if (options.dryRun) {
      console.log(`  (dry-run) ${entry.exerciseName} → ${key} (${formatMb(size)})`);
      continue;
    }
    if (!supabase) throw new Error("Sin cliente de Supabase");

    const { data: existingList } = await supabase.storage
      .from(EXERCISE_VIDEO_BUCKET)
      .list(EXERCISE_VIDEO_PREFIX, { search: `${entry.slug}.mp4`, limit: 10 });
    const existing = existingList?.find((item) => item.name === `${entry.slug}.mp4`);
    const existingSize = (existing?.metadata as { size?: number } | null)?.size;

    if (existingSize === size) {
      skippedUpload += 1;
    } else {
      const body = await readFile(localFile);
      const { error } = await supabase.storage
        .from(EXERCISE_VIDEO_BUCKET)
        .upload(key, body, { contentType: "video/mp4", upsert: true });
      if (error) {
        failures.push({ name: entry.exerciseName, error: error.message });
        continue;
      }
      uploaded += 1;
    }

    const result = await prisma.exercise.updateMany({
      where: { name: entry.exerciseName },
      data: {
        videoUrl: storagePath,
        videoLicense: entry.license ?? null,
        videoAuthor: entry.licenseAuthor ?? null,
        videoSource: entry.source === "wger" ? "wger.de" : "free-exercise-db",
      },
    });

    if (result.count === 0) {
      notFoundInDb += 1;
      console.log(`  ! "${entry.exerciseName}" no existe en exercises (¿nombre distinto al seed?)`);
      continue;
    }
    updated += 1;
  }

  console.log("");
  console.log("Resultado");
  console.log(`  · subidos: ${uploaded} · ya estaban: ${skippedUpload} · fallidos: ${failures.length}`);
  console.log(`  · exercises actualizados: ${updated} · sin fila en la base: ${notFoundInDb}`);
  for (const failure of failures) console.log(`  ! ${failure.name}: ${failure.error}`);

  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
