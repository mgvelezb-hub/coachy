"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Un input de cámara por vista, con la foto de la semana pasada de fondo como
 * guía de encuadre: misma pose, misma luz, misma distancia.
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
  const [showGuide, setShowGuide] = useState(true);

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
        {previousUrl && !preview && showGuide ? (
          <Image
            src={previousUrl}
            alt={`Tu foto de ${label.toLowerCase()} de la semana pasada`}
            fill
            unoptimized
            className="object-cover opacity-30"
          />
        ) : null}

        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`Foto de ${label.toLowerCase()}`} className="h-full w-full object-cover" />
        ) : (
          <span className="relative z-10 flex flex-col items-center gap-1 text-sm text-muted-foreground">
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

      <div className="flex gap-2">
        {previousUrl && !preview ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowGuide((value) => !value)}
          >
            {showGuide ? "Ocultar guía" : "Ver guía"}
          </Button>
        ) : null}
        {preview ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
            <RefreshCw /> Cambiar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
