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

export type LastPerformance = {
  date: string;
  /** Peso de la serie más pesada, sin contar calentamiento. */
  topWeightKg: number;
  topReps: number;
  topRpe: number | null;
  /** Cumplió las reps objetivo en todas las series efectivas. */
  completedScheme: boolean;
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
 * Series objetivo del ejercicio. En los esquemas que suben peso serie a serie
 * la rampa va del 65% al 100% del tope; en los planos, mismo peso siempre.
 */
export function buildTargetSets(
  scheme: Scheme,
  topWeightKg: number | null,
  options: { warmupSets?: number } = {},
): TargetSet[] {
  const sets: TargetSet[] = [];
  const warmups = options.warmupSets ?? 0;

  for (let i = 0; i < warmups; i += 1) {
    sets.push({ reps: 30, weightKg: null, warmup: true });
  }

  const total = scheme.reps.length;
  scheme.reps.forEach((reps, index) => {
    if (topWeightKg === null) {
      sets.push({ reps, weightKg: null, warmup: false });
      return;
    }
    const factor = scheme.ramping && total > 1 ? 0.65 + (0.35 * index) / (total - 1) : 1;
    sets.push({ reps, weightKg: roundWeight(topWeightKg * factor), warmup: false });
  });

  return sets;
}

/** Volumen de una sesión: Σ peso × reps de las series efectivas. */
export function sessionVolume(sets: HistorySet[]): number {
  return effectiveSets(sets).reduce((total, set) => total + (set.weightKg ?? 0) * set.reps, 0);
}
