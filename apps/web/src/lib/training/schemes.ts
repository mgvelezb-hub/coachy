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
  /**
   * El piramidal de PESO del coach: 15-12-10-8 subiendo el peso serie a
   * serie. Distinto del `PIRAMIDAL` de siempre (10-8-6-4-2), que termina en
   * dobles: aquel es trabajo de fuerza, este vive todo el tiempo en el rango
   * de músculo y es el que el coach usa de base para los básicos.
   *
   * Los pesos NO salen de la rampa lineal de `buildTargetSets`: se derivan de
   * la tabla de intensidad relativa por repeticiones (`intensityForReps` en
   * `progression.ts`), que es lo que hace que 15 reps queden en ~81 % del
   * peso de 8 y no en un 65 % inventado. Ver `pesosPorIntensidad` en
   * `coach.ts`.
   */
  PIRAMIDAL_PESO: {
    id: "PIRAMIDAL_PESO",
    label: "4 series 15-12-10-8 subiendo peso",
    reps: [15, 12, 10, 8],
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
 * Lo que la persona puede elegir en preferencias sobre CÓMO se arma su
 * esquema semanal. `RECOMENDADO` es y sigue siendo el default: deja que
 * `schemeForWeek` rote piramidal → fuerza → metabólico → rango medio, que es
 * la periodización ondulante — variar el estímulo semana a semana, que Rhea
 * et al. (2002) encuentran igual o superior a la periodización lineal para
 * ganancias de fuerza. Los otros tres valores fijan un único esquema todas
 * las semanas, para quien prefiere no variar:
 *
 * - `FUERZA` fija el esquema `FUERZA` del catálogo (5×6 con peso máximo):
 *   fuerza máxima vive en 1-5 reps al ≥85% 1RM con descansos largos de 2-5
 *   min (ACSM).
 * - `METABOLICO` fija el esquema `METABOLICO` (30-28-25): resistencia
 *   muscular vive en 15+ reps con carga ligera y descansos cortos (≤60 s).
 * - `HIPERTROFIA` fija `RANGO_MEDIO` (18-15-12) — no hay un esquema del
 *   catálogo llamado "hipertrofia", así que se mapea al que más se acerca al
 *   rango clásico de 6-12 reps al 67-85% 1RM (Schoenfeld et al. 2017,
 *   meta-análisis de cargas — aunque el espectro completo de cargas produce
 *   hipertrofia si las series se acercan al fallo, este es el punto medio
 *   del catálogo existente).
 *
 * Los días de `REHAB` NUNCA respetan esta preferencia: la lesión manda sobre
 * el gusto (`schemeForExercise` revisa `options.rehab` antes que nada).
 */
export const SCHEME_PREFERENCES = [
  "RECOMENDADO",
  "FUERZA",
  "HIPERTROFIA",
  "METABOLICO",
  "COACH",
] as const;
export type SchemePreference = (typeof SCHEME_PREFERENCES)[number];

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

/**
 * El esquema de la semana.
 *
 * Sin `preference` (o con `RECOMENDADO`) rota piramidal → fuerza →
 * metabólico → rango medio, tal cual siempre lo hizo — la rotación sigue
 * siendo el default porque la evidencia la respalda (ver el docblock de
 * `SCHEME_PREFERENCES`). Con una preferencia fija, esa semana usa siempre el
 * mismo esquema, sin importar cuál toque en la rotación.
 *
 * Cualquier valor que no sea uno de `SCHEME_PREFERENCES` (dato corrupto, o el
 * `index` que `Array.prototype.map` le pasaría de colado a un callback de dos
 * parámetros) cae de vuelta a `RECOMENDADO`: una preferencia rota no puede
 * dejar a nadie sin rutina.
 */
export function schemeForWeek(date: Date, preference?: SchemePreference): SchemeId {
  // `COACH` es la forma de entrenar del coach de Irma, tal cual: piramidal de
  // peso una semana, rango medio la otra, y en los accesorios la última serie
  // al fallo (eso lo pone `coach.ts`, que es donde vive lo que el esquema no
  // sabe expresar). No es una quinta variante de "elige tu rango de reps":
  // es el método completo, y por eso rota como rota el original.
  if (preference === "COACH") {
    return isoWeekNumber(date) % 2 === 1 ? "PIRAMIDAL_PESO" : "RANGO_MEDIO";
  }
  if (preference === "FUERZA") return "FUERZA";
  if (preference === "METABOLICO") return "METABOLICO";
  // `HIPERTROFIA` no es un esquema del catálogo: se mapea a `RANGO_MEDIO`
  // (ver el docblock de `SCHEME_PREFERENCES` para el porqué).
  if (preference === "HIPERTROFIA") return "RANGO_MEDIO";

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
