import type { Scheme, SchemeId } from "@/lib/training/types";

/**
 * Esquemas sello del coach (metodología §3). Rotan entre semanas para variar el
 * estímulo; los descansos salen de la biblioteca de rutinas: 45s default, 1 min
 * en básicos pesados, 15-30s en metabólico.
 */
export const SCHEMES: Record<SchemeId, Scheme> = {
  PIRAMIDAL: {
    id: "PIRAMIDAL",
    label: "5 series 10-8-6-4-2 subiendo peso",
    reps: [10, 8, 6, 4, 2],
    restSeconds: 60,
    ramping: true,
  },
  FUERZA: {
    id: "FUERZA",
    label: "5 series de 6 con peso máximo",
    reps: [6, 6, 6, 6, 6],
    restSeconds: 60,
    ramping: false,
  },
  METABOLICO: {
    id: "METABOLICO",
    label: "3 series 30-28-25 subiendo peso",
    reps: [30, 28, 25],
    restSeconds: 30,
    ramping: true,
  },
  RANGO_MEDIO: {
    id: "RANGO_MEDIO",
    label: "3 series 18-15-12 subiendo peso",
    reps: [18, 15, 12],
    restSeconds: 45,
    ramping: true,
  },
  VOLUMEN_9: {
    id: "VOLUMEN_9",
    label: "9 series de 20",
    reps: [20, 20, 20, 20, 20, 20, 20, 20, 20],
    restSeconds: 30,
    ramping: false,
  },
  REHAB: {
    id: "REHAB",
    label: "3 series de 25 con peso bajo",
    reps: [25, 25, 25],
    restSeconds: 45,
    ramping: false,
  },
};

/** El orden de la rotación semanal, tal como lo describe la visión v2. */
export const SCHEME_ROTATION: SchemeId[] = ["PIRAMIDAL", "FUERZA", "METABOLICO", "RANGO_MEDIO"];

/**
 * Número de semana ISO (lunes = primer día, semana 1 = la del primer jueves).
 * Sirve como semilla: la rotación de esquemas es una función de la semana, no
 * un contador guardado en ningún lado.
 */
export function isoWeekNumber(date: Date): number {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Jueves de esa semana ISO.
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(copy.getUTCFullYear(), 0, 1);
  return Math.ceil(((copy.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** El esquema de la semana: piramidal → fuerza → metabólico → rango medio. */
export function schemeForWeek(date: Date): SchemeId {
  const index = (isoWeekNumber(date) - 1) % SCHEME_ROTATION.length;
  return SCHEME_ROTATION[index] as SchemeId;
}

/**
 * Los ejercicios de volumen del coach (costurera, shrugs, press de pantorrilla)
 * siempre van a 9 series, sin importar el esquema de la semana.
 */
const NINE_SET_ROLES = new Set(["abductor", "trapecio", "pantorrilla"]);

export function schemeForExercise(
  poolRole: string,
  weekScheme: SchemeId,
  options: { rehab?: boolean } = {},
): SchemeId {
  if (options.rehab) return "REHAB";
  if (NINE_SET_ROLES.has(poolRole)) return "VOLUMEN_9";
  return weekScheme;
}
