import "server-only";

import { PHOTO_BUCKET } from "@/lib/env";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

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

/**
 * URL firmada de una foto. El admin la pide con service role (ya validó que el
 * check-in existe); el atleta con su propia sesión.
 */
export async function signedPhotoUrl(
  path: string,
  options: { asAdmin?: boolean } = {},
): Promise<string | null> {
  const supabase = options.asAdmin
    ? createSupabaseAdminClient()
    : await createSupabaseServerClient();

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

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

export async function deleteProgressPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = createSupabaseAdminClient();
  await supabase.storage.from(PHOTO_BUCKET).remove(paths);
}
