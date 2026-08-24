import "server-only";

import type { Prisma, Profile, Workout } from "@prisma/client";

import { fromISODate, isoFromDateColumn } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { generateWeek, mondayOf, sundayEndOf } from "@/lib/training/generate";
import { lastPerformance, type LastPerformance } from "@/lib/training/progression";
import type {
  ExerciseOption,
  HistorySet,
  HistoryWorkout,
  PlannedExercise,
  TargetSet,
  TrainingProfile,
} from "@/lib/training/types";

/** El perfil de Prisma, aplanado a lo que el generador necesita. */
export function toTrainingProfile(profile: Profile): TrainingProfile {
  const schedule =
    profile.trainingSchedule !== null &&
    typeof profile.trainingSchedule === "object" &&
    !Array.isArray(profile.trainingSchedule)
      ? (profile.trainingSchedule as Record<string, string>)
      : null;

  return {
    liftingDays: profile.liftingDays,
    trainingSchedule: schedule,
    conditions: profile.conditions,
    phase: profile.currentPhase,
    sessionMinutes: profile.sessionMinutes,
    cardioMinWk: profile.cardioMinWk,
  };
}

export async function loadCatalog(): Promise<ExerciseOption[]> {
  const rows = await prisma.exercise.findMany({ orderBy: { name: "asc" } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    muscleGroup: row.muscleGroup,
    poolRole: row.poolRole,
    videoUrl: row.videoUrl,
    isTracker: row.isTracker,
    substitutes: row.substitutes,
  }));
}

/** Sesiones anteriores con sus series, para progresión y para no repetirse. */
export async function loadHistory(
  userId: string,
  before: Date,
  weeks = 8,
): Promise<HistoryWorkout[]> {
  const from = new Date(before);
  from.setDate(from.getDate() - weeks * 7);

  const rows = await prisma.workout.findMany({
    where: { userId, date: { gte: from, lt: before } },
    include: { sets: true },
    orderBy: { date: "asc" },
  });

  return rows.map((row) => ({
    date: isoFromDateColumn(row.date),
    exerciseNames: parseStoredPlan(row.exercisesJson).exercises.map((exercise) => exercise.name),
    sets: row.sets.map(
      (set): HistorySet => ({
        exerciseId: set.exerciseId,
        exerciseName: set.exerciseName,
        setIndex: set.setIndex,
        targetReps: set.targetReps,
        reps: set.reps,
        weightKg: set.weightKg === null ? null : Number(set.weightKg),
        rpe: set.rpe,
        warmup: set.warmup,
      }),
    ),
  }));
}

export type StoredPlan = {
  dayKind: string;
  schemeLabel: string;
  cardioMinutes: number | null;
  exercises: PlannedExercise[];
};

/**
 * `exercises_json` → el plan tipado.
 *
 * Acepta las dos formas: el objeto que escribe el generador y un array pelón
 * (cómo se veía la columna antes de la Fase 4).
 */
export function parseStoredPlan(json: Prisma.JsonValue): StoredPlan {
  if (Array.isArray(json)) {
    return { dayKind: "", schemeLabel: "", cardioMinutes: null, exercises: parsePlan(json) };
  }
  if (json === null || typeof json !== "object") {
    return { dayKind: "", schemeLabel: "", cardioMinutes: null, exercises: [] };
  }

  const row = json as Record<string, unknown>;
  return {
    dayKind: String(row.dayKind ?? ""),
    schemeLabel: String(row.schemeLabel ?? ""),
    cardioMinutes: typeof row.cardioMinutes === "number" ? row.cardioMinutes : null,
    exercises: parsePlan((row.exercises ?? []) as Prisma.JsonValue),
  };
}

/** La lista de ejercicios del plan, tolerando filas viejas o a medias. */
export function parsePlan(json: Prisma.JsonValue): PlannedExercise[] {
  if (!Array.isArray(json)) return [];

  return json.map((raw) => {
    const row = raw as Record<string, unknown>;
    const sets = Array.isArray(row.sets) ? row.sets : [];

    return {
      exerciseId: typeof row.exerciseId === "string" ? row.exerciseId : null,
      name: String(row.name ?? ""),
      muscleGroup: String(row.muscleGroup ?? ""),
      poolRole: String(row.poolRole ?? ""),
      scheme: String(row.scheme ?? "PIRAMIDAL") as PlannedExercise["scheme"],
      schemeLabel: String(row.schemeLabel ?? ""),
      restSeconds: Number(row.restSeconds ?? 45),
      videoPath: typeof row.videoPath === "string" ? row.videoPath : null,
      tracker: row.tracker === true,
      note: typeof row.note === "string" ? row.note : null,
      sets: sets.map((rawSet): TargetSet => {
        const set = rawSet as Record<string, unknown>;
        return {
          reps: Number(set.reps ?? 0),
          weightKg: typeof set.weightKg === "number" ? set.weightKg : null,
          warmup: set.warmup === true,
        };
      }),
    };
  });
}

/**
 * Materializa la semana en `workouts` si no existe todavía.
 *
 * Corre a demanda: la primera vez que la atleta abre `/app` o el modo gimnasio
 * en la semana. No hay cron que dependa de que alguien esté despierto un lunes
 * a las 6am, y volver a llamarla no duplica nada — `(user_id, date)` es único.
 */
export async function ensureWeekMaterialized(
  userId: string,
  profile: Profile,
  reference: Date,
): Promise<Workout[]> {
  const monday = mondayOf(reference);
  const sunday = sundayEndOf(reference);

  const existing = await prisma.workout.findMany({
    where: { userId, date: { gte: monday, lte: sunday } },
    orderBy: { date: "asc" },
  });
  if (existing.length > 0) return existing;

  const [catalog, history] = await Promise.all([
    loadCatalog(),
    loadHistory(userId, monday),
  ]);

  const week = generateWeek(toTrainingProfile(profile), history, {
    weekStart: monday,
    catalog,
  });

  for (const workout of week.workouts) {
    const date = fromISODate(workout.date);
    await prisma.workout.upsert({
      where: { userId_date: { userId, date } },
      create: {
        userId,
        date,
        muscleGroup: workout.muscleGroup,
        scheme: workout.scheme,
        exercisesJson: {
          dayKind: workout.dayKind,
          schemeLabel: workout.schemeLabel,
          cardioMinutes: workout.cardioMinutes,
          exercises: workout.exercises,
        } as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
  }

  return prisma.workout.findMany({
    where: { userId, date: { gte: monday, lte: sunday } },
    orderBy: { date: "asc" },
  });
}

/** El mejor peso levantado por ejercicio: la vara contra la que se mide un PR. */
export async function personalBests(
  userId: string,
  exerciseNames: string[],
): Promise<Record<string, number>> {
  if (exerciseNames.length === 0) return {};

  const rows = await prisma.workoutSet.groupBy({
    by: ["exerciseName"],
    where: {
      workout: { userId },
      warmup: false,
      exerciseName: { in: exerciseNames },
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

/**
 * Lo que hizo la última vez en cada ejercicio, para prellenar los steppers
 * cuando la rutina se generó sin historial (o cuando el ejercicio se estrenó
 * después). Trae reps y RPE, no solo el peso: sin eso no se puede traducir la
 * carga al esquema de esta semana ni aplicar la progresión doble.
 */
export async function lastPerformances(
  userId: string,
  reference: Date,
  exercises: Array<{ id: string | null; name: string }>,
): Promise<Record<string, LastPerformance>> {
  const history = await loadHistory(userId, reference);
  const map: Record<string, LastPerformance> = {};

  for (const exercise of exercises) {
    const last = lastPerformance(history, exercise);
    if (last) map[exercise.name] = last;
  }
  return map;
}

/** Un récord: el mejor peso levantado en un ejercicio, con sus reps y su fecha. */
export type PersonalRecord = {
  exerciseName: string;
  weightKg: number;
  reps: number;
  /** ISO `YYYY-MM-DD` de la sesión donde ocurrió. */
  date: string;
};

/**
 * Récord por ejercicio: el mejor peso, y a ese peso las mejores reps.
 *
 * El calentamiento nunca cuenta (`warmup: false`), que es la razón de que la
 * serie ligera de arranque no pueda ensuciar un PR.
 */
export async function personalRecords(
  userId: string,
  exerciseNames?: string[],
): Promise<Record<string, PersonalRecord>> {
  if (exerciseNames !== undefined && exerciseNames.length === 0) return {};

  const rows = await prisma.workoutSet.findMany({
    where: {
      workout: { userId },
      warmup: false,
      weightKg: { not: null },
      reps: { gt: 0 },
      ...(exerciseNames === undefined ? {} : { exerciseName: { in: exerciseNames } }),
    },
    select: {
      exerciseName: true,
      reps: true,
      weightKg: true,
      workout: { select: { date: true } },
    },
  });

  const best: Record<string, PersonalRecord> = {};

  for (const row of rows) {
    const weightKg = Number(row.weightKg);
    const current = best[row.exerciseName];
    const better =
      current === undefined ||
      weightKg > current.weightKg ||
      (weightKg === current.weightKg && row.reps > current.reps);

    if (better) {
      best[row.exerciseName] = {
        exerciseName: row.exerciseName,
        weightKg,
        reps: row.reps,
        date: isoFromDateColumn(row.workout.date),
      };
    }
  }

  return best;
}
