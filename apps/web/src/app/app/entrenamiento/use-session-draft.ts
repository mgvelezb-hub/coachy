"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "coachy:training-draft";

/** Una serie ya marcada en el gimnasio. */
export type SetEntry = {
  reps: number;
  weightKg: number | null;
  performedAt: string;
};

export type SessionDraft = {
  /** Clave `${exerciseIndex}:${setIndex}` → lo que levantó. */
  entries: Record<string, SetEntry>;
  /** RPE por ejercicio, `${exerciseIndex}` → 1-10. */
  rpe: Record<string, number>;
  /**
   * Cambios de ejercicio hechos hoy: `${exerciseIndex}` → id del catálogo.
   *
   * Viven en el borrador porque el cambio pasa en el gimnasio, sin señal: la
   * pantalla lo aplica al momento y esto es lo que después sube la cola. Solo
   * se guarda el último cambio de cada lugar — es el que describe el plan real.
   */
  substitutions: Record<string, string>;
  notes: string;
  completedAt: string | null;
};

export const EMPTY_DRAFT: SessionDraft = {
  entries: {},
  rpe: {},
  substitutions: {},
  notes: "",
  completedAt: null,
};

/**
 * Borrador de la sesión en el teléfono.
 *
 * Es lo mismo que ya hace el check-in, pero aquí importa más: si la app se
 * cierra a media rutina (o se acaba la batería a mitad de la última serie), al
 * volver sigue todo lo capturado.
 */
export function useSessionDraft(workoutId: string | null): {
  draft: SessionDraft;
  loaded: boolean;
  update: (next: Partial<SessionDraft>) => SessionDraft;
  clear: () => void;
} {
  const key = workoutId ? `${PREFIX}:${workoutId}` : null;
  const [draft, setDraft] = useState<SessionDraft>(EMPTY_DRAFT);
  const [loaded, setLoaded] = useState(false);
  // El ref deja que `update` devuelva el borrador ya fusionado en el mismo tick:
  // quien marca una serie necesita el payload completo para encolarlo de una.
  const current = useRef<SessionDraft>(EMPTY_DRAFT);

  useEffect(() => {
    let next = EMPTY_DRAFT;
    if (key) {
      try {
        const stored = window.localStorage.getItem(key);
        if (stored) next = { ...EMPTY_DRAFT, ...(JSON.parse(stored) as SessionDraft) };
      } catch {
        next = EMPTY_DRAFT;
      }
    }
    current.current = next;
    setDraft(next);
    setLoaded(true);
  }, [key]);

  const update = useCallback(
    (next: Partial<SessionDraft>): SessionDraft => {
      const merged = { ...current.current, ...next };
      current.current = merged;
      setDraft(merged);

      if (key) {
        try {
          window.localStorage.setItem(key, JSON.stringify(merged));
        } catch {
          // Sin espacio: la sesión sigue en memoria y en la cola de sync.
        }
      }
      return merged;
    },
    [key],
  );

  const clear = useCallback(() => {
    if (key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Nada que hacer.
      }
    }
    current.current = EMPTY_DRAFT;
    setDraft(EMPTY_DRAFT);
  }, [key]);

  return { draft, loaded, update, clear };
}
