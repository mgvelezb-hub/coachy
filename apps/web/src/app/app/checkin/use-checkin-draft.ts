"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "coachy:checkin-draft";

export type CheckInDraft = Record<string, string | string[]>;

/**
 * Borrador del check-in en localStorage.
 *
 * Se guarda por fecha: si se cae la conexión o se cierra la app a medias, al
 * volver el domingo sigue todo escrito. Nunca guarda fotos — pesan demasiado y
 * son datos sensibles que no queremos dejando rastro en el disco del teléfono.
 */
export function useCheckInDraft(date: string): {
  draft: CheckInDraft;
  loaded: boolean;
  setValue: (key: string, value: string | string[]) => void;
  clear: () => void;
} {
  const key = `${STORAGE_PREFIX}:${date}`;
  const [draft, setDraft] = useState<CheckInDraft>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) setDraft(JSON.parse(stored) as CheckInDraft);
    } catch {
      // localStorage lleno o modo privado: seguimos sin borrador.
    }
    setLoaded(true);
  }, [key]);

  const setValue = useCallback(
    (field: string, value: string | string[]) => {
      setDraft((current) => {
        const next = { ...current, [field]: value };
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Sin espacio: el formulario sigue funcionando en memoria.
        }
        return next;
      });
    },
    [key],
  );

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nada que hacer.
    }
    setDraft({});
  }, [key]);

  return { draft, loaded, setValue, clear };
}
