import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { SessionSyncInput } from "@/lib/validation/training";

/**
 * Persistencia de una sesión de gimnasio, aislada para poder probarla.
 *
 * El teléfono manda la sesión entera cada vez que la cola se vacía. Se escribe
 * serie por serie con `upsert` sobre `(workout_id, client_id)`: la red mala del
 * gimnasio puede reintentar sin miedo.
 */
export type PersistedSession = {
  workoutId: string;
  savedSets: number;
  volumeKg: number;
  /** Ejercicios donde el peso de hoy superó todo lo anterior. */
  prs: Array<{ exerciseName: string; weightKg: number; previousKg: number | null }>;
};

export async function persistSession(
  userId: string,
  input: SessionSyncInput,
): Promise<PersistedSession | null> {
  const workout = await prisma.workout.findFirst({
    where: { id: input.workoutId, userId },
    select: { id: true },
  });
  // El filtro por `userId` es la defensa real: Prisma se conecta con un rol que
  // ignora RLS. Si la sesión no es suya, aquí se acaba.
  if (!workout) return null;

  const previousBest = await bestByExercise(
    userId,
    input.sets.map((set) => set.exerciseName),
    input.workoutId,
  );

  for (const set of input.sets) {
    const data = {
      exerciseId: set.exerciseId,
      exerciseName: set.exerciseName,
      setIndex: set.setIndex,
      targetReps: set.targetReps,
      reps: set.reps,
      weightKg: set.weightKg === null ? null : set.weightKg.toFixed(2),
      rpe: set.rpe,
      warmup: set.warmup,
      performedAt: new Date(set.performedAt),
    };

    await prisma.workoutSet.upsert({
      where: { workoutId_clientId: { workoutId: workout.id, clientId: set.clientId } },
      create: { workoutId: workout.id, clientId: set.clientId, ...data },
      update: data,
    });
  }

  const effective = input.sets.filter((set) => !set.warmup && (set.weightKg ?? 0) > 0);
  const volumeKg = effective.reduce((total, set) => total + (set.weightKg ?? 0) * set.reps, 0);

  const todayBest = new Map<string, number>();
  for (const set of effective) {
    const weight = set.weightKg ?? 0;
    if (weight > (todayBest.get(set.exerciseName) ?? 0)) todayBest.set(set.exerciseName, weight);
  }

  const prs = [...todayBest.entries()]
    .filter(([name, weight]) => weight > (previousBest[name] ?? 0))
    .map(([exerciseName, weightKg]) => ({
      exerciseName,
      weightKg,
      previousKg: previousBest[exerciseName] ?? null,
    }));

  const rpeByExercise: Record<string, number> = {};
  for (const set of input.sets) {
    if (set.rpe !== null) rpeByExercise[set.exerciseName] = set.rpe;
  }

  await prisma.workout.update({
    where: { id: workout.id },
    data: {
      completedAt: input.completedAt ? new Date(input.completedAt) : null,
      loadsJson: {
        volumeKg: Math.round(volumeKg),
        prs,
        rpeByExercise,
        notes: input.notes,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return { workoutId: workout.id, savedSets: input.sets.length, volumeKg, prs };
}

/** Mejor peso por ejercicio antes de esta sesión. */
async function bestByExercise(
  userId: string,
  exerciseNames: string[],
  excludeWorkoutId: string,
): Promise<Record<string, number>> {
  const names = [...new Set(exerciseNames)];
  if (names.length === 0) return {};

  const rows = await prisma.workoutSet.groupBy({
    by: ["exerciseName"],
    where: {
      workout: { userId },
      workoutId: { not: excludeWorkoutId },
      warmup: false,
      exerciseName: { in: names },
      weightKg: { not: null },
    },
    _max: { weightKg: true },
  });

  const best: Record<string, number> = {};
  for (const row of rows) {
    if (row._max.weightKg !== null && row._max.weightKg !== undefined) {
      best[row.exerciseName] = Number(row._max.weightKg);
    }
  }
  return best;
}
