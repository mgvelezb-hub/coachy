"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { cachedVideoIndex, downloadVideo, supportsVideoCache } from "@/lib/video-cache";

/**
 * Pre-descarga los videos de la rutina de esta semana.
 *
 * Nadie se acuerda de descargar antes de salir al gimnasio. Así que en cuanto
 * se abre la app con red, y en segundo plano, los videos de la semana
 * materializada se van guardando en el teléfono: son pocos (los de la rutina,
 * no los 42 del catálogo) y para el jueves ya están ahí.
 *
 * Reglas: nunca bloquea la UI (arranca en tiempo muerto), no corre sin red, se
 * respeta el ahorro de datos y las redes lentas, y una vez por carga de la app.
 * Lo que ya está descargado no se vuelve a bajar.
 */

const ROUTES = ["/app", "/app/entrenamiento"];

/** Una sola corrida por carga de la app: navegar entre pestañas no la repite. */
let started = false;

type WeekVideo = { path: string; url: string | null; bytes: number };

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function connectionIsStingy(): boolean {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;

  if (!connection) return false;
  if (connection.saveData === true) return true;
  return typeof connection.effectiveType === "string" && connection.effectiveType.includes("2g");
}

async function prefetchWeekVideos(): Promise<void> {
  if (!supportsVideoCache()) return;
  if (isOffline()) return;
  if (connectionIsStingy()) return;

  let videos: WeekVideo[] = [];
  try {
    const response = await fetch("/api/exercise-videos/week");
    if (!response.ok) return;
    const body = (await response.json()) as { videos?: WeekVideo[] };
    videos = body.videos ?? [];
  } catch {
    return;
  }

  if (videos.length === 0) return;

  const index = await cachedVideoIndex();
  const pending = videos.filter((video) => video.url && !(video.path in index));

  for (const video of pending) {
    if (isOffline()) return;
    const outcome = await downloadVideo(video.path, video.url as string, {
      expectedBytes: video.bytes,
    });
    // Sin espacio no tiene caso seguir intentando con los demás.
    if (!outcome.ok && outcome.reason === "quota") return;
  }
}

function whenIdle(task: () => void): () => void {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback;

  if (typeof idle === "function") {
    idle(task);
    return () => undefined;
  }

  const timer = window.setTimeout(task, 3000);
  return () => window.clearTimeout(timer);
}

export function WeekVideoPrefetch(): null {
  const pathname = usePathname();

  useEffect(() => {
    if (started) return;
    if (!ROUTES.includes(pathname)) return;
    started = true;
    return whenIdle(() => {
      void prefetchWeekVideos();
    });
  }, [pathname]);

  return null;
}
