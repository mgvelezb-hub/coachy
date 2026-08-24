/**
 * Nombres de buckets y rutas canónicas de Storage.
 *
 * Vive aparte de `lib/storage.ts` a propósito: ese módulo es `server-only` y
 * los guiones de mantenimiento (`scripts/*.mts`) necesitan las mismas
 * constantes sin arrastrar el runtime de Next.
 */

/** Bucket PRIVADO con las demostraciones en video del catálogo de ejercicios. */
export const EXERCISE_VIDEO_BUCKET = "exercise-videos";

/** Carpeta dentro del bucket: un solo video por ejercicio, compartido. */
export const EXERCISE_VIDEO_PREFIX = "library";

/** Ruta canónica que se guarda en `exercises.video_url`. Nunca una URL firmada. */
export function exerciseVideoPath(slug: string): string {
  return `${EXERCISE_VIDEO_BUCKET}/${EXERCISE_VIDEO_PREFIX}/${slug}.mp4`;
}

/**
 * Separa `exercises.video_url` en bucket + llave. Acepta la ruta con o sin el
 * prefijo del bucket, para tolerar filas viejas.
 */
export function splitExerciseVideoPath(value: string): { bucket: string; key: string } {
  const prefix = `${EXERCISE_VIDEO_BUCKET}/`;
  if (value.startsWith(prefix)) {
    return { bucket: EXERCISE_VIDEO_BUCKET, key: value.slice(prefix.length) };
  }
  return { bucket: EXERCISE_VIDEO_BUCKET, key: value.replace(/^\/+/, "") };
}
