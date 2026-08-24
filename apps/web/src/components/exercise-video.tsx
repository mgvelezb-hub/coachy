"use client";

import { useEffect, useRef, useState } from "react";
import { HardDriveDownload, VideoOff, Wifi } from "lucide-react";

import { cachedVideoUrl, signVideoUrls } from "@/lib/video-cache";

type Source = "local" | "red";

/**
 * Reproductor de una demostración, con el video local primero.
 *
 * Primero busca el video en el teléfono: si está descargado, se arma un object
 * URL con el blob y reproduce sin tocar la red — ese es el punto de toda la
 * biblioteca. Si no está, usa la URL firmada que vino con la página; y si esa
 * ya caducó (la página pudo salir del caché del service worker horas después),
 * pide una nueva. Sin red y sin descarga, dice exactamente eso.
 *
 * Vive en `components/` y no en la biblioteca porque el modo gimnasio necesita
 * exactamente lo mismo: para que la sesión reproduzca lo descargado, su
 * `<video src={exercise.videoUrl}>` se cambia por
 * `<ExerciseVideo path={exercise.videoPath} signedUrl={exercise.videoUrl} />`.
 */
export function ExerciseVideo({
  path,
  signedUrl,
}: {
  path: string | null;
  signedUrl: string | null;
}): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [failed, setFailed] = useState(false);
  const objectUrl = useRef<string | null>(null);
  const retried = useRef(false);

  useEffect(() => {
    let alive = true;

    async function resolve(): Promise<void> {
      if (path) {
        const local = await cachedVideoUrl(path);
        if (!alive) {
          if (local) URL.revokeObjectURL(local);
          return;
        }
        if (local) {
          objectUrl.current = local;
          setSrc(local);
          setSource("local");
          return;
        }
      }

      if (!alive) return;
      if (signedUrl) {
        setSrc(signedUrl);
        setSource("red");
        return;
      }
      setFailed(true);
    }

    void resolve();

    return () => {
      alive = false;
      if (objectUrl.current) {
        URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = null;
      }
    };
  }, [path, signedUrl]);

  /** La firma caduca en una hora; un solo reintento con una URL nueva. */
  async function handleError(): Promise<void> {
    if (!path || retried.current) {
      setFailed(true);
      return;
    }
    retried.current = true;
    try {
      const urls = await signVideoUrls([path]);
      const fresh = urls[path];
      if (fresh) {
        setSrc(fresh);
        setSource("red");
        return;
      }
    } catch {
      // Sin red no hay firma nueva: se muestra el aviso de abajo.
    }
    setFailed(true);
  }

  if (!path) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        <VideoOff className="size-4 shrink-0" />
        Este ejercicio todavía no tiene video.
      </div>
    );
  }

  if (failed || !src) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        <VideoOff className="size-4 shrink-0" />
        {failed
          ? "El video no cargó. Descárgalo con señal y queda en el teléfono."
          : "Buscando el video…"}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className="w-full rounded-lg border bg-black"
        onError={() => void handleError()}
      />
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {source === "local" ? (
          <>
            <HardDriveDownload className="size-3" /> Desde el teléfono, sin usar datos
          </>
        ) : (
          <>
            <Wifi className="size-3" /> Se está viendo por internet
          </>
        )}
      </p>
    </div>
  );
}
