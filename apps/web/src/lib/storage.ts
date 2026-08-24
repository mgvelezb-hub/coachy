import "server-only";

import { PHOTO_BUCKET } from "@/lib/env";
import {
  EXERCISE_VIDEO_BUCKET,
  exerciseVideoPath,
  splitExerciseVideoPath,
} from "@/lib/storage-paths";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

export { EXERCISE_VIDEO_BUCKET, exerciseVideoPath };

/** Ruta canónica dentro del bucket privado: `{user_id}/{checkin_id}/{vista}.jpg`. */
export function photoPath(userId: string, checkInId: string, view: string): string {
  return `${userId}/${checkInId}/${view.toLowerCase()}.jpg`;
}

/**
 * Sube una foto de progreso con la sesión del propio atleta, de modo que las
 * políticas de Storage (RLS por primera carpeta = user_id) sigan aplicando.
 */
export async function uploadProgressPhoto(
  path: string,
  file: File | Blob,
  contentType = "image/jpeg",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType, upsert: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const SIGNED_URL_TTL_SECONDS = 60 * 30;

/** TTL corto para el análisis de visión: la URL vive lo que tarda una descarga. */
export const SHORT_SIGNED_URL_TTL_SECONDS = 60;

/**
 * URL firmada de una foto. El admin la pide con service role (ya validó que el
 * check-in existe); el atleta con su propia sesión.
 */
export async function signedPhotoUrl(
  path: string,
  options: { asAdmin?: boolean; ttlSeconds?: number } = {},
): Promise<string | null> {
  const supabase = options.asAdmin
    ? createSupabaseAdminClient()
    : await createSupabaseServerClient();

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, options.ttlSeconds ?? SIGNED_URL_TTL_SECONDS);

  if (error || !data) return null;
  return data.signedUrl;
}

/** Firma varias rutas de golpe; devuelve un mapa ruta → URL. */
export async function signedPhotoUrls(
  paths: string[],
  options: { asAdmin?: boolean } = {},
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const supabase = options.asAdmin
    ? createSupabaseAdminClient()
    : await createSupabaseServerClient();

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error || !data) return {};

  const map: Record<string, string> = {};
  for (const entry of data) {
    if (entry.signedUrl && entry.path) map[entry.path] = entry.signedUrl;
  }
  return map;
}

/** Una hora: lo que dura una sesión de gimnasio viendo la demostración. */
export const EXERCISE_VIDEO_TTL_SECONDS = 60 * 60;

/**
 * URL firmada del video de demostración de un ejercicio.
 *
 * Recibe lo que guarda `exercises.video_url` (`exercise-videos/library/{slug}.mp4`,
 * nunca una URL firmada) y devuelve un enlace temporal listo para un `<video>`.
 * El bucket es privado y sus políticas solo dejan leer a usuarios autenticados,
 * así que la firma se pide con la sesión del propio usuario.
 *
 * Lo consume el modo gimnasio: al mostrar un ejercicio de la rutina, firma su
 * `videoUrl` en el servidor y pasa el resultado al reproductor del cliente.
 * Devuelve `null` si el ejercicio no tiene video o si la firma falla, para que
 * la UI simplemente no pinte el reproductor.
 */
export async function signedExerciseVideoUrl(
  path: string | null | undefined,
  options: { asAdmin?: boolean; ttlSeconds?: number } = {},
): Promise<string | null> {
  if (!path) return null;

  const { bucket, key } = splitExerciseVideoPath(path);
  const supabase = options.asAdmin
    ? createSupabaseAdminClient()
    : await createSupabaseServerClient();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(key, options.ttlSeconds ?? EXERCISE_VIDEO_TTL_SECONDS);

  if (error || !data) return null;
  return data.signedUrl;
}

/** Firma varios videos de golpe; devuelve un mapa `video_url` → URL firmada. */
export async function signedExerciseVideoUrls(
  paths: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const wanted = [...new Set(paths.filter((value): value is string => Boolean(value)))];
  if (wanted.length === 0) return {};

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(EXERCISE_VIDEO_BUCKET)
    .createSignedUrls(
      wanted.map((value) => splitExerciseVideoPath(value).key),
      EXERCISE_VIDEO_TTL_SECONDS,
    );

  if (error || !data) return {};

  const map: Record<string, string> = {};
  data.forEach((entry, index) => {
    const original = wanted[index];
    if (original && entry.signedUrl) map[original] = entry.signedUrl;
  });
  return map;
}

export async function deleteProgressPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = createSupabaseAdminClient();
  await supabase.storage.from(PHOTO_BUCKET).remove(paths);
}
