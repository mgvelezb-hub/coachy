import { Directory, File, Paths } from "expo-file-system";

/**
 * Descarga local de videos de ejercicio (Biblioteca, Fase N5).
 *
 * Un video descargado vive en `documentDirectory/videos/<archivo>.mp4`, con el
 * mismo nombre de archivo que trae `videoPath` (la ruta de Storage,
 * `library/<slug>.mp4`). Así una pantalla solo necesita el `videoPath` del
 * ejercicio para saber si ya hay copia local, sin mantener un índice aparte.
 *
 * Se llama desde `src/app/(tabs)/biblioteca.tsx`. La purga completa se
 * engancha en `src/context/session.tsx` junto a `purgeTrainingData()`: lo
 * descargado de una atleta no puede quedar disponible para la siguiente
 * sesión que abra el teléfono.
 */

function videosDirectory(): Directory {
  return new Directory(Paths.document, "videos");
}

/** `library/press-banca.mp4` → `press-banca.mp4`. Sin extensión, se asume .mp4. */
function filenameFor(videoPath: string): string {
  const base = videoPath.split("/").pop() || videoPath;
  return base.includes(".") ? base : `${base}.mp4`;
}

/** El `File` local de un video, exista o no todavía. */
export function localVideoFile(videoPath: string): File {
  return new File(videosDirectory(), filenameFor(videoPath));
}

/** ¿Ya hay copia local de este video? */
export function isVideoDownloaded(videoPath: string): boolean {
  try {
    return localVideoFile(videoPath).exists;
  } catch {
    return false;
  }
}

/** Descarga el video de `url` a la carpeta local, reemplazando lo que hubiera. */
export async function downloadVideo(videoPath: string, url: string): Promise<void> {
  const dir = videosDirectory();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

  const destination = localVideoFile(videoPath);
  if (destination.exists) destination.delete();

  await File.downloadFileAsync(url, destination);
}

/** Quita la descarga local de un solo video. No falla si ya no estaba. */
export function removeVideoDownload(videoPath: string): void {
  const file = localVideoFile(videoPath);
  if (file.exists) file.delete();
}

/** Borra toda la carpeta de videos descargados. Se llama al cerrar sesión. */
export function purgeVideoDownloads(): void {
  const dir = videosDirectory();
  if (dir.exists) dir.delete();
}

/** Cuántos videos hay descargados ahora mismo en el teléfono. Para Ajustes. */
export function countDownloadedVideos(): number {
  const dir = videosDirectory();
  if (!dir.exists) return 0;
  try {
    return dir.list().length;
  } catch {
    return 0;
  }
}
