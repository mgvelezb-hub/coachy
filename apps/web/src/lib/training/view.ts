import "server-only";

import type { Profile } from "@prisma/client";

import { toISODate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { signedExerciseVideoUrls } from "@/lib/storage";
import {
  ensureWeekMaterialized,
  lastWeights,
  parseStoredPlan,
  personalBests,
} from "@/lib/training/db";
import { mondayOf, sundayEndOf } from "@/lib/training/generate";
import type { PlannedExercise } from "@/lib/training/types";

/**
 * Lo que el modo gimnasio necesita para funcionar sin red: la semana entera,
 * ya resuelta. Se guarda tal cual en IndexedDB, así que aquí no puede quedar
 * nada que dependa del servidor para pintarse.
 */

export type SessionExerciseView = PlannedExercise & {
  /** URL firmada del video. Caduca; sin red la pantalla se pinta igual. */
  videoUrl: string | null;
  /** Último peso registrado en ese ejercicio, para prellenar. */
  lastWeightKg: number | null;
  /** El mejor peso histórico: la vara del PR. */
  bestWeightKg: number | null;
};

export type SessionView = {
  workoutId: string;
  date: string;
  muscleGroup: string;
  scheme: string;
  schemeLabel: string;
  cardioMinutes: number | null;
  completedAt: string | null;
  exercises: SessionExerciseView[];
};

export type WeekView = {
  weekStart: string;
  today: string;
  sessions: SessionView[];
};

/**
 * Semana completa de entrenamiento, materializándola si es la primera vez que
 * se abre en la semana.
 */
export async function weekView(
  userId: string,
  profile: Profile,
  reference: Date,
): Promise<WeekView> {
  const workouts = await ensureWeekMaterialized(userId, profile, reference);
  const plans = workouts.map((workout) => ({
    workout,
    plan: parseStoredPlan(workout.exercisesJson),
  }));

  const allExercises = plans.flatMap((entry) => entry.plan.exercises);
  const names = [...new Set(allExercises.map((exercise) => exercise.name))];

  const [videos, best, last] = await Promise.all([
    signedExerciseVideoUrls(allExercises.map((exercise) => exercise.videoPath)).catch(() => ({})),
    personalBests(userId, names),
    lastWeights(
      userId,
      mondayOf(reference),
      allExercises.map((exercise) => ({ id: exercise.exerciseId, name: exercise.name })),
    ),
  ]);

  const sessions = plans.map(({ workout, plan }): SessionView => {
    return {
      workoutId: workout.id,
      date: toISODate(workout.date),
      muscleGroup: workout.muscleGroup,
      scheme: workout.scheme,
      schemeLabel: plan.schemeLabel,
      cardioMinutes: plan.cardioMinutes,
      completedAt: workout.completedAt ? workout.completedAt.toISOString() : null,
      exercises: plan.exercises.map((exercise) => ({
        ...exercise,
        videoUrl: exercise.videoPath ? ((videos as Record<string, string>)[exercise.videoPath] ?? null) : null,
        lastWeightKg: last[exercise.name] ?? null,
        bestWeightKg: best[exercise.name] ?? null,
      })),
    };
  });

  return {
    weekStart: toISODate(mondayOf(reference)),
    today: toISODate(reference),
    sessions,
  };
}

/** La sesión de hoy, o null si hoy toca descanso. */
export function sessionOf(week: WeekView, isoDate: string): SessionView | null {
  return week.sessions.find((session) => session.date === isoDate) ?? null;
}

export type TodayCard = {
  workoutId: string;
  muscleGroup: string;
  schemeLabel: string;
  exerciseCount: number;
  cardioMinutes: number | null;
  completed: boolean;
};

/**
 * Lo mínimo para la tarjeta "Hoy" del home: sin firmar videos ni cargar el
 * historial completo. Materializa la semana si es la primera visita.
 */
export async function todayCard(
  userId: string,
  profile: Profile,
  reference: Date,
): Promise<TodayCard | null> {
  const workouts = await ensureWeekMaterialized(userId, profile, reference);
  const iso = toISODate(reference);
  const workout = workouts.find((row) => toISODate(row.date) === iso);
  if (!workout) return null;

  const plan = parseStoredPlan(workout.exercisesJson);
  return {
    workoutId: workout.id,
    muscleGroup: workout.muscleGroup,
    schemeLabel: plan.schemeLabel,
    exerciseCount: plan.exercises.length,
    cardioMinutes: plan.cardioMinutes,
    completed: workout.completedAt !== null,
  };
}

export type TrainingHistoryRow = {
  workoutId: string;
  date: string;
  muscleGroup: string;
  volumeKg: number;
  sets: number;
  prs: Array<{ exerciseName: string; weightKg: number }>;
  completed: boolean;
};

/** Últimas sesiones entrenadas, para el historial. */
export async function trainingHistory(userId: string, take = 12): Promise<TrainingHistoryRow[]> {
  const rows = await prisma.workout.findMany({
    where: { userId, completedAt: { not: null } },
    orderBy: { date: "desc" },
    take,
    include: { sets: { where: { warmup: false } } },
  });

  return rows.map((row) => {
    const loads =
      row.loadsJson !== null && typeof row.loadsJson === "object" && !Array.isArray(row.loadsJson)
        ? (row.loadsJson as Record<string, unknown>)
        : {};

    const volumeFromSets = row.sets.reduce(
      (total, set) => total + Number(set.weightKg ?? 0) * set.reps,
      0,
    );

    const prsRaw = Array.isArray(loads.prs) ? loads.prs : [];

    return {
      workoutId: row.id,
      date: toISODate(row.date),
      muscleGroup: row.muscleGroup,
      volumeKg: typeof loads.volumeKg === "number" ? loads.volumeKg : Math.round(volumeFromSets),
      sets: row.sets.length,
      prs: prsRaw.map((raw) => {
        const pr = raw as Record<string, unknown>;
        return { exerciseName: String(pr.exerciseName ?? ""), weightKg: Number(pr.weightKg ?? 0) };
      }),
      completed: true,
    };
  });
}

/** Rango de la semana ISO de `date`, para consultas. */
export function weekRange(date: Date): { from: Date; to: Date } {
  return { from: mondayOf(date), to: sundayEndOf(date) };
}
