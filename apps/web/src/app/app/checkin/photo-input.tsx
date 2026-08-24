"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Eye, EyeOff, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Cámara guiada: un input por vista con la foto de la semana pasada encimada
 * como fantasma, para igualar pose, encuadre y distancia.
 *
 * El `<input capture>` del teléfono abre la cámara nativa, así que no hay
 * preview en vivo donde dibujar el fantasma. Se hace en los dos momentos que sí
 * controlamos:
 *
 *  1. **Antes de disparar** — el hueco muestra la foto anterior de fondo, así
 *     ella ya sabe a qué encuadre le está apuntando.
 *  2. **Al confirmar** — la foto que acaba de elegir queda con la anterior
 *     encimada al 35 %: si la pose no coincide, se ve de inmediato y "Repetir"
 *     abre la cámara otra vez sin perder nada.
 *
 * El fantasma se puede apagar con un toque. Sin foto previa no hay fantasma, ni
 * botón, ni estado extra: el flujo queda exactamente como estaba.
 */
export function PhotoInput({
  view,
  label,
  previousUrl,
}: {
  view: string;
  label: string;
  previousUrl: string | null;
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showGhost, setShowGhost] = useState(true);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  const ghostVisible = Boolean(previousUrl) && showGhost;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {preview ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            <Check className="size-3.5" /> Lista
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/40 transition-colors",
          preview && "border-solid border-primary",
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={`Foto de ${label.toLowerCase()}`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}

        {/* El fantasma: encima de la foto nueva, debajo del texto. */}
        {ghostVisible && previousUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previousUrl}
            alt={`Tu foto de ${label.toLowerCase()} de la semana pasada`}
            aria-hidden={preview !== null}
            className="pointer-events-none absolute inset-0 z-10 h-full w-full object-cover opacity-35"
          />
        ) : null}

        {preview ? null : (
          <span className="relative z-20 flex flex-col items-center gap-1 text-sm text-muted-foreground">
            <Camera className="size-6" />
            {previousUrl ? "Encuadra como la de atrás" : "Tomar foto"}
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        name={`photo_${view}`}
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="sr-only"
      />

      <div className="flex flex-wrap items-center gap-2">
        {previousUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={showGhost}
            onClick={() => setShowGhost((value) => !value)}
          >
            {showGhost ? <EyeOff /> : <Eye />}
            {showGhost ? "Ocultar guía" : "Ver guía"}
          </Button>
        ) : null}

        {preview ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
            <RefreshCw /> Repetir
          </Button>
        ) : null}
      </div>

      {preview && previousUrl && showGhost ? (
        <p className="text-xs text-muted-foreground">
          Encimada al 35 % está la de la semana pasada. Si la pose no empata, repite la foto.
        </p>
      ) : null}
    </div>
  );
}
