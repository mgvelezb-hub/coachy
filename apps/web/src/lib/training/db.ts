import "server-only";

import type { Phase, Prisma, Profile, Workout } from "@prisma/client";

import { fromISODate, isoFromDateColumn, shiftISODate, toISODate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { emphasisFor } from "@/lib/training/emphasis";
import { planDisciplines, type OtherSession } from "@/lib/training/disciplines";
import { generateWeek, mondayOf, sundayEndOf } from "@/lib/training/generate";
import { isoWeekNumber } from "@/lib/training/schemes";
import { WEEK_DAYS, liftingDaysWithinBudget, trainingDaysOf, type WeekDay } from "@/lib/training/split";
import { lastPerformance, type LastPerformance } from "@/lib/training/progression";
import { DISCIPLINES, MUSCLE_GROUPS } from "@/lib/training/types";
import type {
  DayKind,
  Discipline,
  DisciplineLoad,
  ExerciseOption,
  HistorySet,
  HistoryWorkout,
  MuscleGroup,
  PlannedExercise,
  TargetSet,
  SwimLevel,
  TrainingProfile,
  VolumeBias,
} from "@/lib/training/types";

/**
 * Traduce la fase de la dieta (`Phase`, del motor de nutrición) al único dato
 * que el generador de rutinas necesita de ella: cuánto volumen meter.
 *
 * Esta función es **la única frontera** entre nutrición y entrenamiento — el
 * resto de `training/` no importa `Phase` ni conoce sus 7 valores (ver
 * `VolumeBias` en `types.ts`). Si mañana aparece un segundo método de
 * nutrición (con otras fases, o sin fases), aquí es el único lugar que se
 * toca: se agrega el `if`/`switch` que corresponda y todo lo demás sigue
 * igual.
 *
 * Hoy la única regla real es la de siempre: en corte agresivo se recorta un
 * ejercicio por sesión.
 */
export function volumeBiasForPhase(phase: Phase): VolumeBias {
  return phase === "CUT_AGRESIVO" ? "reducido" : "normal";
}

/**
 * `other_disciplines` es JSON libre en la base: lo que llegue mal formado se
 * ignora en vez de tumbar la rutina de la semana. Una preferencia corrupta no
 * puede dejar a nadie sin entrenar.
 */
export function parseDisciplineLoads(raw: unknown): DisciplineLoad[] {
  if (!Array.isArray(raw)) return [];

  const loads: DisciplineLoad[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") continue;
    const { discipline, sessionsPerWeek } = entry as Record<string, unknown>;
    if (typeof discipline !== "string") continue;
    if (!(DISCIPLINES as readonly string[]).includes(discipline)) continue;
    if (typeof sessionsPerWeek !== "number" || !Number.isFinite(sessionsPerWeek)) continue;
    loads.push({
      discipline: discipline as Discipline,
      sessionsPerWeek: Math.max(0, Math.min(7, Math.trunc(sessionsPerWeek))),
    });
  }
  return loads;
}

/** Las etiquetas de grupo que el generador entiende; el resto se descarta. */
function parseMuscleGroups(raw: string[]): MuscleGroup[] {
  return raw.filter((group): group is MuscleGroup =>
    (MUSCLE_GROUPS as readonly string[]).includes(group),
  );
}

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
    volumeBias: volumeBiasForPhase(profile.currentPhase),
    sessionMinutes: profile.sessionMinutes,
    cardioMinWk: profile.cardioMinWk,
    avoidRepeatGroups: parseMuscleGroups(profile.avoidRepeatGroups),
    primaryDiscipline: profile.primaryDiscipline as Discipline,
    otherDisciplines: parseDisciplineLoads(profile.otherDisciplines),
    disciplineLevels: parseNiveles(profile.disciplineLevels, profile.swimLevel as SwimLevel),
    gymLevel: parseNiveles(profile.disciplineLevels, profile.swimLevel as SwimLevel).PESAS ?? "PRINCIPIANTE",
    goal: profile.goal,
  };
}

/**
 * Los niveles declarados por disciplina.
 *
 * `swimLevel` sigue siendo el respaldo de natación: existía antes de que el
 * nivel fuera por disciplina, y quien ya lo había elegido no tiene por qué
 * volver a hacerlo.
 */
export function parseNiveles(
  raw: unknown,
  swimLevel: SwimLevel,
): Partial<Record<Discipline, SwimLevel>> {
  const niveles: Partial<Record<Discipline, SwimLevel>> = { NATACION: swimLevel };
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return niveles;

  for (const [clave, valor] of Object.entries(raw as Record<string, unknown>)) {
    if (!(DISCIPLINES as readonly string[]).includes(clave)) continue;
    if (valor !== "PRINCIPIANTE" && valor !== "INTERMEDIO" && valor !== "AVANZADO") continue;
    niveles[clave as Discipline] = valor;
  }
  return niveles;
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
    level: row.level,
    equipment: row.equipment,
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
 * Las fechas ISO de gimnasio de esa semana.
 *
 * Aplica el presupuesto semanal, igual que el generador: si hay disciplinas
 * activas, los días que se llevan NO son días de pesas. Sin esto, la
 * reconciliación dejaría vivos los días que el presupuesto ya no paga.
 */
function plannedDatesOf(profile: Profile, monday: Date): string[] {
  const mondayISO = toISODate(monday);
  const training = toTrainingProfile(profile);
  return trainingDaysOf(training)
    .slice(0, liftingDaysWithinBudget(training))
    .map((day) => shiftISODate(mondayISO, WEEK_DAYS.indexOf(day)));
}

/**
 * Las sesiones de las otras disciplinas de la semana.
 *
 * Se recalculan a partir de la semana de pesas ya materializada en vez de
 * guardarse: son sugerencias de día con su plan, no filas que alguien vaya a
 * editar. Lo que sí queda registrado es lo que se hizo, y eso vive en
 * `ActivitySession`.
 */
export function otherSessionsFor(
  profile: Profile,
  monday: Date,
  workouts: Array<{ date: Date; exercisesJson: Prisma.JsonValue }>,
): OtherSession[] {
  const mondayISO = toISODate(monday);
  const gymByDay = new Map<WeekDay, DayKind>();

  for (const workout of workouts) {
    const iso = isoFromDateColumn(workout.date);
    const index = WEEK_DAYS.findIndex((_, position) => shiftISODate(mondayISO, position) === iso);
    const day = WEEK_DAYS[index];
    const kind = parseStoredPlan(workout.exercisesJson).dayKind;
    if (day && kind) gymByDay.set(day, kind as DayKind);
  }

  const training = toTrainingProfile(profile);
  return planDisciplines({
    weekStart: monday,
    otherDisciplines: training.otherDisciplines,
    gymByDay,
    niveles: training.disciplineLevels,
    objetivo: training.goal as never,
    isoWeek: isoWeekNumber(monday),
  }).sessions;
}

/**
 * Materializa la semana en `workouts`, y la RECONCILIA con el perfil de hoy.
 *
 * Corre a demanda: la primera vez que la atleta abre `/app` o el modo gimnasio
 * en la semana. No hay cron que dependa de que alguien esté despierto un lunes
 * a las 6am, y volver a llamarla no duplica nada — `(user_id, date)` es único.
 *
 * Reconciliar es lo que arregla el hueco de "cambié mis días y la semana se
 * quedó como estaba": si el perfil pasa de 4 a 5 días a media semana, el día
 * que falta se genera aquí mismo. Nada de lo ya vivido se toca — solo se
 * BORRAN los días que el horario nuevo ya no pide, y únicamente si están de
 * hoy en adelante, sin series capturadas y sin completar. Un día entrenado es
 * historia, y la historia no se reescribe.
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
    include: { _count: { select: { sets: true } } },
  });

  const planned = plannedDatesOf(profile, monday);
  const existingDates = new Set(existing.map((workout) => isoFromDateColumn(workout.date)));
  const missing = planned.filter((date) => !existingDates.has(date));

  const todayISO = toISODate(reference);
  const plannedSet = new Set(planned);
  const stale = existing.filter((workout) => {
    const date = isoFromDateColumn(workout.date);
    return (
      !plannedSet.has(date) &&
      date >= todayISO &&
      workout.completedAt === null &&
      workout._count.sets === 0
    );
  });

  if (missing.length === 0 && stale.length === 0) {
    return existing.map(({ _count, ...workout }) => workout);
  }

  if (stale.length > 0) {
    await prisma.workout.deleteMany({ where: { id: { in: stale.map((workout) => workout.id) } } });
  }

  const [catalog, history, emphasis] = await Promise.all([
    loadCatalog(),
    loadHistory(userId, monday),
    // Lo que salió de comparar sus fotos contra su referencia: qué grupo
    // lleva prioridad. Sin análisis todavía, llega vacío.
    emphasisFor(userId).catch(() => []),
  ]);

  const week = generateWeek(toTrainingProfile(profile), history, {
    weekStart: monday,
    catalog,
    emphasis,
  });

  // Solo se escriben los días que faltaban: `update: {}` protegería la fila
  // existente de todos modos, pero ni siquiera se toca.
  const missingSet = new Set(missing);
  for (const workout of week.workouts) {
    if (!missingSet.has(workout.date)) continue;

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
