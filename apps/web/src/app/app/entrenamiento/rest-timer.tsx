"use client";

import { useEffect, useState } from "react";
import { Timer, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Cronómetro de descanso.
 *
 * Arranca solo al marcar una serie (45s o 60s según el esquema, 30s en
 * metabólico). Cuando llega a cero no suena nada — en el gimnasio la música
 * tapa cualquier tono: el aviso es visual, y una vibración corta si el teléfono
 * la soporta.
 */
export function RestTimer({
  startedAt,
  seconds,
  onDismiss,
}: {
  startedAt: number;
  seconds: number;
  onDismiss: () => void;
}): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const elapsed = Math.floor((now - startedAt) / 1000);
  const left = seconds - elapsed;
  const done = left <= 0;

  useEffect(() => {
    if (!done) return;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(200);
    }
  }, [done]);

  const label = done
    ? "¡Va la que sigue!"
    : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
        done ? "border-primary bg-primary/10" : "bg-muted"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <Timer className={`size-5 ${done ? "text-primary" : "text-muted-foreground"}`} />
        <span className="text-lg font-semibold tabular-nums">{label}</span>
        {!done ? <span className="text-xs text-muted-foreground">descanso</span> : null}
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onDismiss} aria-label="Cerrar">
        <X />
      </Button>
    </div>
  );
}
