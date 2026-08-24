/**
 * Videos guardados en el teléfono.
 *
 * La biblioteca existe para que el gimnasio sin señal siga teniendo la
 * demostración de cada ejercicio. El bucket es privado y se lee con URLs
 * firmadas que caducan, así que **la URL no puede ser la llave del caché**: al
 * día siguiente la firma es otra y el video "descargado" se volvería a bajar.
 *
 * La llave es la ruta canónica del ejercicio (`exercise-videos/library/x.mp4`),
 * estable para siempre. Se descarga el blob con la URL firmada del momento y se
 * guarda en Cache Storage bajo esa llave sintética. Para reproducir, primero se
 * busca ahí y se arma un object URL; si no está, se cae a la red.
 *
 * El caché vive aparte (`coachy-videos-v1`) para poder borrarlo solo: "Liberar
 * espacio" lo vacía desde la página y el service worker lo borra al cerrar
 * sesión, porque un teléfono se presta.
 */

/** Caché exclusivo de los videos. El service worker lo conoce con este nombre. */
export const VIDEO_CACHE = "coachy-videos-v1";

/** Prefijo de la llave sintética. No existe como ruta real del servidor. */
export const VIDEO_KEY_PREFIX = "/__coachy-video/";

const BYTES_HEADER = "x-coachy-bytes";
const SAVED_AT_HEADER = "x-coachy-saved-at";

/** Firmar de más cuesta; de menos, deja huecos. Un lote razonable por llamada. */
export const SIGN_BATCH_SIZE = 40;

export type LibraryVideo = {
  /** Ruta canónica en Storage. Es la llave del caché. */
  path: string;
  /** Tamaño conocido, en bytes. `0` si el bucket no lo reportó. */
  bytes: number;
};

export type DownloadOutcome =
  | { ok: true; bytes: number }
  | { ok: false; reason: "unsupported" | "network" | "quota" | "aborted" };

export type BatchProgress = {
  /** Videos ya resueltos (bien o mal). */
  done: number;
  total: number;
  loadedBytes: number;
  totalBytes: number;
  /** Ruta que se está bajando ahora mismo. */
  current: string | null;
};

export type BatchResult = {
  downloaded: number;
  bytes: number;
  failed: string[];
  aborted: boolean;
  /** El navegador se quedó sin espacio: la UI lo dice en lugar de reintentar. */
  quotaExceeded: boolean;
};

/** Sin Cache Storage no hay modo offline; la UI se degrada sola. */
export function supportsVideoCache(): boolean {
  return typeof caches !== "undefined";
}

export function normalizeVideoPath(path: string): string {
  return path.replace(/^\/+/, "");
}

/** Llave estable de un video dentro del caché. */
export function videoCacheKey(path: string): string {
  return `${VIDEO_KEY_PREFIX}${encodeURIComponent(normalizeVideoPath(path))}`;
}

/** La ruta de vuelta, para reconstruir el índice desde `cache.keys()`. */
export function videoPathFromKey(url: string): string | null {
  const at = url.indexOf(VIDEO_KEY_PREFIX);
  if (at < 0) return null;
  const encoded = url.slice(at + VIDEO_KEY_PREFIX.length);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/**
 * La llave, absoluta. Cache Storage indexa por URL completa; en pruebas no hay
 * `location`, así que se resuelve contra un origen fijo.
 */
function keyUrl(path: string): string {
  const origin = typeof location !== "undefined" ? location.origin : "http://localhost";
  return `${origin}${videoCacheKey(path)}`;
}

function isQuotaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { name?: unknown }).name === "AbortError";
}

// --- Lectura ----------------------------------------------------------------

/** Ruta → bytes de todo lo que ya está en el teléfono. */
export async function cachedVideoIndex(): Promise<Record<string, number>> {
  if (!supportsVideoCache()) return {};

  try {
    const cache = await caches.open(VIDEO_CACHE);
    const keys = await cache.keys();
    const index: Record<string, number> = {};

    for (const request of keys) {
      const path = videoPathFromKey(request.url);
      if (!path) continue;
      const response = await cache.match(request);
      const declared = Number(response?.headers.get(BYTES_HEADER) ?? 0);
      index[path] = Number.isFinite(declared) && declared > 0 ? declared : 0;
    }

    return index;
  } catch {
    return {};
  }
}

/**
 * Object URL del video guardado, o `null` si no está.
 *
 * Quien lo pide es dueño de revocarlo (`URL.revokeObjectURL`) al desmontar el
 * reproductor: cada uno retiene el blob completo en memoria.
 */
export async function cachedVideoUrl(path: string): Promise<string | null> {
  if (!supportsVideoCache()) return null;

  try {
    const cache = await caches.open(VIDEO_CACHE);
    const response = await cache.match(new Request(keyUrl(path)));
    if (!response) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function isVideoCached(path: string): Promise<boolean> {
  if (!supportsVideoCache()) return false;
  try {
    const cache = await caches.open(VIDEO_CACHE);
    return (await cache.match(new Request(keyUrl(path)))) !== undefined;
  } catch {
    return false;
  }
}

// --- Escritura --------------------------------------------------------------

/**
 * Baja un video y lo guarda bajo su llave estable.
 *
 * Se lee por partes para poder pintar la barra de progreso: el `content-length`
 * de la URL firmada da el total y, si no viene, se usa el tamaño que reportó el
 * bucket al armar la biblioteca.
 */
export async function downloadVideo(
  path: string,
  url: string,
  options: {
    expectedBytes?: number;
    signal?: AbortSignal;
    onBytes?: (delta: number, loaded: number, total: number) => void;
  } = {},
): Promise<DownloadOutcome> {
  if (!supportsVideoCache()) return { ok: false, reason: "unsupported" };

  try {
    const response = await fetch(url, { signal: options.signal });
    if (!response.ok || !response.body) return { ok: false, reason: "network" };

    const declared = Number(response.headers.get("content-length") ?? 0);
    const total = declared > 0 ? declared : (options.expectedBytes ?? 0);
    const type = response.headers.get("content-type") ?? "video/mp4";

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      loaded += value.byteLength;
      options.onBytes?.(value.byteLength, loaded, total);
    }

    const blob = new Blob(chunks as BlobPart[], { type });
    const cache = await caches.open(VIDEO_CACHE);
    await cache.put(
      new Request(keyUrl(path)),
      new Response(blob, {
        headers: {
          "content-type": type,
          [BYTES_HEADER]: String(blob.size),
          [SAVED_AT_HEADER]: new Date().toISOString(),
        },
      }),
    );

    return { ok: true, bytes: blob.size };
  } catch (error) {
    if (isAbortError(error)) return { ok: false, reason: "aborted" };
    if (isQuotaError(error)) return { ok: false, reason: "quota" };
    return { ok: false, reason: "network" };
  }
}

/** Lo que falta por bajar de una lista, contra lo que ya está guardado. */
export function pendingVideos(
  videos: LibraryVideo[],
  index: Record<string, number>,
): LibraryVideo[] {
  return videos.filter((video) => video.path && !(video.path in index));
}

export function totalBytes(videos: LibraryVideo[]): number {
  return videos.reduce((sum, video) => sum + (video.bytes || 0), 0);
}

/**
 * Baja una lista completa, de uno en uno.
 *
 * Las URLs se piden frescas justo antes de usarlas (`resolveUrls`), en lotes:
 * las que vinieron con el HTML pueden llevar horas ahí y una firma caducada
 * aborta la descarga a media biblioteca.
 *
 * Secuencial a propósito: son archivos de varios MB sobre datos móviles, y en
 * paralelo lo único que se gana es saturar la conexión y perder el progreso.
 */
export async function downloadVideos(
  videos: LibraryVideo[],
  resolveUrls: (paths: string[]) => Promise<Record<string, string>>,
  options: {
    onProgress?: (progress: BatchProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<BatchResult> {
  const result: BatchResult = {
    downloaded: 0,
    bytes: 0,
    failed: [],
    aborted: false,
    quotaExceeded: false,
  };

  if (!supportsVideoCache() || videos.length === 0) return result;

  const total = videos.length;
  const grandTotal = totalBytes(videos);
  let done = 0;
  let loadedBytes = 0;

  for (let start = 0; start < videos.length; start += SIGN_BATCH_SIZE) {
    if (options.signal?.aborted) {
      result.aborted = true;
      return result;
    }

    const slice = videos.slice(start, start + SIGN_BATCH_SIZE);
    let urls: Record<string, string> = {};
    try {
      urls = await resolveUrls(slice.map((video) => video.path));
    } catch {
      for (const video of slice) result.failed.push(video.path);
      done += slice.length;
      options.onProgress?.({ done, total, loadedBytes, totalBytes: grandTotal, current: null });
      continue;
    }

    for (const video of slice) {
      if (options.signal?.aborted) {
        result.aborted = true;
        return result;
      }

      const url = urls[video.path];
      if (!url) {
        result.failed.push(video.path);
        done += 1;
        options.onProgress?.({ done, total, loadedBytes, totalBytes: grandTotal, current: null });
        continue;
      }

      options.onProgress?.({
        done,
        total,
        loadedBytes,
        totalBytes: grandTotal,
        current: video.path,
      });

      const base = loadedBytes;
      const outcome = await downloadVideo(video.path, url, {
        expectedBytes: video.bytes,
        signal: options.signal,
        onBytes: (_delta, loaded) => {
          loadedBytes = base + loaded;
          options.onProgress?.({
            done,
            total,
            loadedBytes,
            totalBytes: grandTotal,
            current: video.path,
          });
        },
      });

      done += 1;

      if (outcome.ok) {
        result.downloaded += 1;
        result.bytes += outcome.bytes;
        loadedBytes = base + outcome.bytes;
      } else {
        loadedBytes = base + (video.bytes || 0);
        if (outcome.reason === "aborted") {
          result.aborted = true;
          return result;
        }
        if (outcome.reason === "quota") {
          result.quotaExceeded = true;
          result.failed.push(video.path);
          return result;
        }
        result.failed.push(video.path);
      }

      options.onProgress?.({ done, total, loadedBytes, totalBytes: grandTotal, current: null });
    }
  }

  return result;
}

// --- Borrado ----------------------------------------------------------------

/** Libera lo que ocupan esas rutas. Devuelve cuántas se borraron. */
export async function removeVideos(paths: string[]): Promise<number> {
  if (!supportsVideoCache() || paths.length === 0) return 0;

  try {
    const cache = await caches.open(VIDEO_CACHE);
    let removed = 0;
    for (const path of paths) {
      if (await cache.delete(new Request(keyUrl(path)))) removed += 1;
    }
    return removed;
  } catch {
    return 0;
  }
}

/** Vacía el caché entero. También lo hace el service worker al cerrar sesión. */
export async function purgeVideoCache(): Promise<void> {
  if (!supportsVideoCache()) return;
  try {
    await caches.delete(VIDEO_CACHE);
  } catch {
    // Sin caché no hay nada que liberar.
  }
}

// --- Números para la UI -----------------------------------------------------

const MB = 1024 * 1024;

/** Tamaño legible. En MB hasta 1 GB: es la unidad en la que la gente piensa. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(1)} GB`;
  if (bytes >= 10 * MB) return `${Math.round(bytes / MB)} MB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

export type StorageEstimate = { usage: number; quota: number };

/** Cuánto espacio le queda al navegador, si lo quiere decir. */
export async function estimateStorage(): Promise<StorageEstimate | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    if (typeof estimate.usage !== "number" || typeof estimate.quota !== "number") return null;
    return { usage: estimate.usage, quota: estimate.quota };
  } catch {
    return null;
  }
}

/** Pide URLs firmadas frescas para esas rutas. Lo usa toda descarga. */
export async function signVideoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const response = await fetch("/api/exercise-videos/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });

  if (!response.ok) throw new Error(`no se pudieron firmar los videos (${response.status})`);
  const body = (await response.json()) as { urls?: Record<string, string> };
  return body.urls ?? {};
}
