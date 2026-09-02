import type { HistorySet, HistoryWorkout, Scheme, TargetSet } from "@/lib/training/types";

/**
 * Progresión doble (metodología §3: "celebra cada PR — la fuerza es el
 * indicador de que no se pierde músculo en déficit").
 *
 * Regla: si la última vez completó todas las reps del esquema y reportó RPE ≤ 8
 * en la serie tope, sube el peso. Si no, repite el mismo. Sin historial no
 * inventamos nada: el campo va vacío y ella escribe lo que levantó.
 */

/** Incremento en kg: mancuerna 2.5, barra o máquina 5. */
const DUMBBELL_HINTS = [
  "mancuerna",
  "martillo",
  "cristos",
  "pájaro",
  "pajaro",
  "elevación lateral",
  "elevacion lateral",
  "elevación frontal",
  "elevacion frontal",
];

/** Ejercicios donde el peso no se mueve en kg (peso corporal o asistidos). */
const BODYWEIGHT_HINTS = ["lagartija", "dominada", "fondos", "plancha", "elevación de piernas"];

export function incrementFor(name: string): number {
  const lower = name.toLowerCase();
  if (BODYWEIGHT_HINTS.some((hint) => lower.includes(hint))) return 0;
  return DUMBBELL_HINTS.some((hint) => lower.includes(hint)) ? 2.5 : 5;
}

/**
 * Intensidad relativa aproximada por reps (tabla tipo Brzycki). Sirve para
 * traducir el peso de una semana a otra cuando el esquema cambió: la rotación
 * mueve el rango de reps cada semana y 5×2 no se levanta con el peso de 3×30.
 */
const INTENSITY_ANCHORS: Array<[reps: number, factor: number]> = [
  [1, 1.0],
  [2, 0.95],
  [4, 0.9],
  [6, 0.85],
  [8, 0.8],
  [10, 0.75],
  [12, 0.7],
  [15, 0.65],
  [18, 0.61],
  [20, 0.58],
  [25, 0.52],
  [30, 0.48],
  [40, 0.42],
];

export function intensityForReps(reps: number): number {
  const first = INTENSITY_ANCHORS[0] as [number, number];
  const last = INTENSITY_ANCHORS[INTENSITY_ANCHORS.length - 1] as [number, number];
  if (reps <= first[0]) return first[1];
  if (reps >= last[0]) return last[1];

  for (let i = 1; i < INTENSITY_ANCHORS.length; i += 1) {
    const [highReps, highFactor] = INTENSITY_ANCHORS[i] as [number, number];
    if (reps > highReps) continue;
    const [lowReps, lowFactor] = INTENSITY_ANCHORS[i - 1] as [number, number];
    const t = (reps - lowReps) / (highReps - lowReps);
    return lowFactor + t * (highFactor - lowFactor);
  }
  return last[1];
}

export function roundWeight(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Al disco de 2.5 kg más cercano: es lo que de verdad se puede armar en la barra. */
export function roundPlate(value: number): number {
  return Math.round(value / 2.5) * 2.5;
}

/**
 * Calentamiento (metodología §3: "empieza con reps altas y peso ligero").
 *
 * Nunca puede verse igual que la serie 1. Las reps del calentamiento salen por
 * encima de la serie más larga del esquema y se acotan a la banda de la
 * biblioteca del coach (20–50), y el peso va al 40–50% del peso de trabajo.
 */
export const WARMUP_REPS_MIN = 20;
export const WARMUP_REPS_MAX = 50;

/** Porcentaje del peso de trabajo por serie de calentamiento. */
const WARMUP_LOAD_RAMP = [0.4, 0.5];

export function warmupRepsFor(scheme: Scheme): number {
  const heaviestSet = Math.max(...scheme.reps);
  const raw = Math.max(WARMUP_REPS_MIN, heaviestSet + 10);
  const rounded = Math.round(raw / 5) * 5;
  return Math.min(WARMUP_REPS_MAX, Math.max(WARMUP_REPS_MIN, rounded));
}

/**
 * Series de calentamiento del ejercicio. Sin peso de trabajo el campo va vacío
 * — la UI lo etiqueta "peso ligero" y ella escribe el suyo.
 */
export function buildWarmupSets(
  scheme: Scheme,
  topWeightKg: number | null,
  count: number,
): TargetSet[] {
  const reps = warmupRepsFor(scheme);

  return Array.from({ length: count }, (_, index): TargetSet => {
    const factor = WARMUP_LOAD_RAMP[Math.min(index, WARMUP_LOAD_RAMP.length - 1)] as number;
    // El calentamiento nunca puede pesar lo mismo que la primera serie efectiva:
    // si el redondeo lo empata, se baja un disco.
    const raw = topWeightKg === null ? null : Math.max(2.5, roundPlate(topWeightKg * factor));
    const weightKg = raw !== null && topWeightKg !== null && raw >= topWeightKg
      ? Math.max(2.5, roundPlate(topWeightKg * 0.4) - 2.5)
      : raw;

    return { reps, weightKg, warmup: true };
  });
}

export type LastPerformance = {
  date: string;
  /** Peso de la serie más pesada, sin contar calentamiento. */
  topWeightKg: number;
  topReps: number;
  topRpe: number | null;
  /** Cumplió las reps objetivo en todas las series efectivas. */
  completedScheme: boolean;
  /**
   * Las reps que DE VERDAD salieron, serie por serie (sin calentamiento).
   *
   * Existe porque el plan y la realidad se separan: quien pide 18 y saca 12
   * no necesita que la semana siguiente le vuelva a pedir 18 —eso no es un
   * objetivo, es un recordatorio de que no llegó— sino arrancar en 12 y
   * pelear por 13. La progresión se construye sobre lo que pasó.
   */
  repsPorSerie: number[];
};

function effectiveSets(sets: HistorySet[]): HistorySet[] {
  return sets.filter((set) => !set.warmup && set.weightKg !== null && set.weightKg > 0);
}

/** La última vez que tocó este ejercicio, con lo que hizo. */
export function lastPerformance(
  history: HistoryWorkout[],
  exercise: { id: string | null; name: string },
): LastPerformance | null {
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));

  for (const workout of sorted) {
    const mine = workout.sets.filter((set) =>
      exercise.id !== null && set.exerciseId !== null
        ? set.exerciseId === exercise.id
        : set.exerciseName === exercise.name,
    );
    const done = effectiveSets(mine);
    if (done.length === 0) continue;

    const top = done.reduce((best, set) =>
      (set.weightKg ?? 0) > (best.weightKg ?? 0) ? set : best,
    );

    return {
      date: workout.date,
      topWeightKg: top.weightKg as number,
      topReps: top.reps > 0 ? top.reps : top.targetReps,
      topRpe: top.rpe,
      completedScheme: done.every((set) => set.reps >= set.targetReps),
      repsPorSerie: done.map((set) => (set.reps > 0 ? set.reps : set.targetReps)),
    };
  }

  return null;
}

/**
 * Peso sugerido para la serie tope de esta semana. `null` cuando no hay
 * historial: la app deja el campo vacío en lugar de adivinar.
 */
export function suggestTopWeight(
  exercise: { name: string },
  scheme: Scheme,
  last: LastPerformance | null,
): number | null {
  if (last === null) return null;

  const topReps = Math.min(...scheme.reps);
  const translated =
    last.topWeightKg * (intensityForReps(topReps) / intensityForReps(last.topReps));

  const earned = last.completedScheme && last.topRpe !== null && last.topRpe <= 8;
  const bump = earned ? incrementFor(exercise.name) : 0;

  return roundWeight(translated + bump);
}

/**
 * Las reps que se le van a pedir esta semana, serie por serie.
 *
 * LA REGLA: el esquema manda mientras se cumpla. Quien completó lo que le
 * tocaba sigue con el esquema (y sube peso, que es la otra mitad de la
 * progresión doble). Quien se quedó corto arranca en lo que SÍ hizo: pedir 18
 * a quien sacó 12 no es un objetivo, es repetir el mismo fracaso cada semana,
 * y ese es el número que hace que la gente deje de abrir la app.
 *
 * Nunca se pide MÁS de lo que dice el esquema: la semana que salieron 20 de
 * 18 no convierte 20 en el nuevo piso — eso lo decide la rotación de
 * esquemas, no una serie con buen día.
 */
export function repsObjetivo(scheme: Scheme, last: LastPerformance | null): number[] {
  if (last === null || last.completedScheme) return [...scheme.reps];

  return scheme.reps.map((planeadas, index) => {
    const reales = last.repsPorSerie[index];
    if (reales === undefined || reales <= 0) return planeadas;
    return Math.min(planeadas, reales);
  });
}

/**
 * Series objetivo del ejercicio. En los esquemas que suben peso serie a serie
 * la rampa va del 65% al 100% del tope; en los planos, mismo peso siempre.
 */
export function buildTargetSets(
  scheme: Scheme,
  topWeightKg: number | null,
  options: { warmupSets?: number; reps?: number[] } = {},
): TargetSet[] {
  const sets: TargetSet[] = buildWarmupSets(scheme, topWeightKg, options.warmupSets ?? 0);

  // `reps` viene de `repsObjetivo` cuando la semana pasada se quedó corta: el
  // esquema sigue mandando el número de series y la rampa de peso, pero las
  // repeticiones arrancan donde de verdad quedó.
  const objetivo = options.reps ?? scheme.reps;
  const total = objetivo.length;
  objetivo.forEach((reps, index) => {
    if (topWeightKg === null) {
      sets.push({ reps, weightKg: null, warmup: false });
      return;
    }
    const factor = scheme.ramping && total > 1 ? 0.65 + (0.35 * index) / (total - 1) : 1;
    sets.push({ reps, weightKg: roundWeight(topWeightKg * factor), warmup: false });
  });

  return sets;
}

/**
 * Prellenado de un plan ya materializado.
 *
 * La rutina de la semana se guardó cuando quizá no había historial de ese
 * ejercicio; para entonces los pesos quedaron vacíos. Cuando la atleta abre la
 * sesión ya sabemos qué levantó la última vez, así que aquí se rellena serie a
 * serie **con la misma rampa del esquema**: en piramidal no se ponen los mismos
 * kg en las 5 series, se escalan del 65% al 100%.
 *
 * Lo que ella ya tenía escrito manda: si el plan trae peso, no se toca.
 */
export function prefillSets(
  exercise: { name: string },
  scheme: Scheme,
  sets: TargetSet[],
  last: LastPerformance | null,
): TargetSet[] {
  if (last === null) return sets;
  if (!sets.some((set) => set.weightKg === null)) return sets;

  const top = suggestTopWeight(exercise, scheme, last);
  if (top === null) return sets;

  const warmupCount = sets.filter((set) => set.warmup).length;
  const rebuilt = buildTargetSets(scheme, top, { warmupSets: warmupCount });
  const warmups = rebuilt.filter((set) => set.warmup);
  const working = rebuilt.filter((set) => !set.warmup);

  let warmupIndex = 0;
  let workingIndex = 0;

  // El plan manda en reps y en cuántas series son; de aquí solo sale el peso.
  return sets.map((set) => {
    const suggestion = set.warmup ? warmups[warmupIndex++] : working[workingIndex++];
    if (set.weightKg !== null || suggestion === undefined) return set;
    return { ...set, weightKg: suggestion.weightKg };
  });
}

/** Volumen de una sesión: Σ peso × reps de las series efectivas. */
export function sessionVolume(sets: HistorySet[]): number {
  return effectiveSets(sets).reduce((total, set) => total + (set.weightKg ?? 0) * set.reps, 0);
}
