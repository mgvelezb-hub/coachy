import "server-only";

import type { Prisma } from "@prisma/client";
import { kcalFloor, loadConfig } from "engine";

import { toEngineProfile } from "@/lib/coachy/mapping";
import { decimalToNumber, toISODate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  buildProposals,
  type ExerciseSessionTop,
  type Proposal,
} from "@/lib/observatory/proposals";
import { sanitizeForAdmin } from "@/lib/observatory/sanitize";
import {
  detectEscalations,
  type EscalationSignal,
  type EscalationWeek,
  type OutOfConfigFinding,
} from "@/lib/observatory/signals";
import { forecast, type Forecast, type TrendPoint } from "@/lib/observatory/trend";
import type { EngineConfig } from "@/lib/engine-types";

/**
 * El observatorio del admin (Fase 3): todo lo que se puede afirmar contando.
 *
 * Regla de privacidad que este archivo sostiene: **la fase del ciclo nunca sale
 * de aquí**. Las semanas afectadas viajan como `inconclusive: boolean`, que es
 * lo único que el admin necesita para no leerlas como estancamiento, y los
 * textos del motor pasan por `sanitizeForAdmin` antes de pintarse.
 */

/** Regla del motor que marca la semana como no concluyente. */
const INCONCLUSIVE_RULE_ID = "R1";
/** Margen del check-in dominical: hasta el martes cuenta como "a tiempo". */
const ON_TIME_DAYS = 2;
/** Ventana de la gráfica y de las cuentas de adherencia. */
const WEEKS_WINDOW = 16;

interface StoredRule {
  id: string;
  nombre?: string;
  explicacion?: string;
}

function rulesFrom(value: Prisma.JsonValue | null): StoredRule[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is StoredRule =>
      row !== null && typeof row === "object" && !Array.isArray(row) && "id" in row,
  );
}

export interface WeekRow {
  date: string;
  waistCm: number | null;
  weightKg: number | null;
  dietCompliance: number;
  trainingCompliance: number;
  /** El motor marcó la semana como no concluyente. Nunca dice por qué. */
  inconclusive: boolean;
  onTime: boolean;
  photoViews: string[];
}

export interface TimelineEntry {
  date: string;
  phase: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  status: string;
  published: boolean;
  /** Explicación del motor, ya filtrada para el admin. */
  explanation: string;
  rules: Array<{ id: string; nombre: string; explicacion: string }>;
  inconclusive: boolean;
}

export interface StrengthWeek {
  /** Lunes ISO de la semana. */
  week: string;
  volumeKg: number;
  sessions: number;
}

export interface PersonalRecord {
  exerciseName: string;
  weightKg: number;
  date: string;
}

export interface AdherenceSummary {
  checkIns: number;
  onTime: number;
  onTimePct: number | null;
  avgDietCompliance: number | null;
  avgTrainingCompliance: number | null;
  lastCheckIn: string | null;
  daysSinceLastCheckIn: number | null;
}

export interface ObservatoryData {
  athlete: { id: string; name: string; email: string };
  currentPhase: string | null;
  currentKcal: number | null;
  weeks: WeekRow[];
  waistForecast: Forecast | null;
  strength: StrengthWeek[];
  personalRecords: PersonalRecord[];
  adherence: AdherenceSummary;
  timeline: TimelineEntry[];
  proposals: Proposal[];
  escalations: EscalationSignal[];
}

function isoWeekMonday(date: Date): string {
  const copy = new Date(date);
  const day = copy.getUTCDay();
  // Domingo (0) pertenece a la semana que empezó el lunes anterior.
  copy.setUTCDate(copy.getUTCDate() - (day === 0 ? 6 : day - 1));
  return copy.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * ¿La propuesta del motor se sale de la config vigente del atleta?
 *
 * Dos comprobaciones, las dos derivables de lo que ya está guardado: que las
 * kcal no bajen del piso (`0.85 × BMR` por defecto) y que la fase no lleve más
 * semanas de las que la config permite.
 */
export function findOutOfConfig(input: {
  latest: { date: string; phase: string; kcal: number } | null;
  weeksInPhase: number;
  kcalFloorValue: number;
  config: EngineConfig;
}): OutOfConfigFinding | null {
  const { latest, weeksInPhase, kcalFloorValue, config } = input;
  if (!latest) return null;

  if (latest.kcal + 1 < kcalFloorValue) {
    return {
      date: latest.date,
      reason: `Propone ${latest.kcal} kcal, por debajo del piso de ${Math.round(kcalFloorValue)} kcal que fija la config.`,
    };
  }

  const maxWeeks = config.maxWeeks[latest.phase as keyof typeof config.maxWeeks];
  if (typeof maxWeeks === "number" && weeksInPhase > maxWeeks) {
    return {
      date: latest.date,
      reason: `Lleva ${weeksInPhase} semanas en ${latest.phase} y la config topa esa fase en ${maxWeeks}.`,
    };
  }

  return null;
}

/** Semanas consecutivas en la fase de la última decisión. */
export function weeksInCurrentPhase(phases: string[]): number {
  if (phases.length === 0) return 0;
  const current = phases[phases.length - 1]!;
  let count = 0;
  for (let i = phases.length - 1; i >= 0; i -= 1) {
    if (phases[i] !== current) break;
    count += 1;
  }
  return count;
}

export async function loadObservatory(
  userId: string,
  today: Date = new Date(),
): Promise<ObservatoryData | null> {
  const athlete = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });

  if (!athlete) return null;

  const todayISO = toISODate(today);

  const checkIns = await prisma.checkIn.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: WEEKS_WINDOW,
    include: {
      decision: true,
      photos: { select: { view: true } },
    },
  });

  const ordered = checkIns.slice().reverse();

  const weeks: WeekRow[] = ordered.map((checkIn) => {
    const rules = rulesFrom(checkIn.decision?.rules ?? null);
    const date = toISODate(checkIn.date);
    return {
      date,
      waistCm: decimalToNumber(checkIn.waistCm),
      weightKg: decimalToNumber(checkIn.weightKg),
      dietCompliance: checkIn.dietCompliance,
      trainingCompliance: checkIn.trainingCompliance,
      inconclusive: rules.some((rule) => rule.id === INCONCLUSIVE_RULE_ID),
      onTime: daysBetween(date, toISODate(checkIn.createdAt)) <= ON_TIME_DAYS,
      photoViews: Array.from(new Set(checkIn.photos.map((photo) => photo.view))),
    };
  });

  const waistPoints: TrendPoint[] = weeks
    .filter((week) => week.waistCm !== null)
    .map((week) => ({
      date: week.date,
      value: week.waistCm as number,
      inconclusive: week.inconclusive,
    }));

  const timeline: TimelineEntry[] = ordered
    .filter((checkIn) => checkIn.decision !== null)
    .map((checkIn) => {
      const decision = checkIn.decision!;
      const rules = rulesFrom(decision.rules);
      return {
        date: toISODate(checkIn.date),
        phase: decision.phase,
        kcal: decision.kcal,
        proteinG: decision.proteinG,
        carbsG: decision.carbsG,
        fatG: decision.fatG,
        status: decision.status,
        published: decision.publishedAt !== null,
        explanation: sanitizeForAdmin(decision.explanation),
        rules: rules.map((rule) => ({
          id: rule.id,
          nombre: rule.nombre ?? rule.id,
          explicacion: sanitizeForAdmin(rule.explicacion ?? ""),
        })),
        inconclusive: rules.some((rule) => rule.id === INCONCLUSIVE_RULE_ID),
      };
    })
    .reverse();

  // ---- Fuerza -------------------------------------------------------------

  const since = new Date(today);
  since.setDate(since.getDate() - WEEKS_WINDOW * 7);

  const workouts = await prisma.workout.findMany({
    where: { userId, date: { gte: since } },
    orderBy: { date: "asc" },
    include: { sets: { where: { warmup: false } } },
  });

  const volumeByWeek = new Map<string, { volumeKg: number; sessions: number }>();
  const tops: ExerciseSessionTop[] = [];
  const bestByExercise = new Map<string, { weightKg: number; date: string }>();

  for (const workout of workouts) {
    const week = isoWeekMonday(workout.date);
    const bucket = volumeByWeek.get(week) ?? { volumeKg: 0, sessions: 0 };
    const date = toISODate(workout.date);
    const topPerExercise = new Map<string, number>();

    for (const set of workout.sets) {
      const weight = decimalToNumber(set.weightKg);
      if (weight === null) continue;
      bucket.volumeKg += weight * set.reps;

      const previousTop = topPerExercise.get(set.exerciseName) ?? 0;
      if (weight > previousTop) topPerExercise.set(set.exerciseName, weight);
    }

    if (workout.sets.length > 0) bucket.sessions += 1;
    volumeByWeek.set(week, bucket);

    for (const [exerciseName, topWeightKg] of topPerExercise) {
      tops.push({ exerciseName, date, topWeightKg });
      const best = bestByExercise.get(exerciseName);
      if (!best || topWeightKg > best.weightKg) {
        bestByExercise.set(exerciseName, { weightKg: topWeightKg, date });
      }
    }
  }

  const strength: StrengthWeek[] = [...volumeByWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, bucket]) => ({
      week,
      volumeKg: Math.round(bucket.volumeKg),
      sessions: bucket.sessions,
    }));

  const personalRecords: PersonalRecord[] = [...bestByExercise.entries()]
    .map(([exerciseName, best]) => ({ exerciseName, ...best }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.exerciseName.localeCompare(b.exerciseName))
    .slice(0, 6);

  // ---- Adherencia ---------------------------------------------------------

  const last = weeks[weeks.length - 1] ?? null;
  const adherence: AdherenceSummary = {
    checkIns: weeks.length,
    onTime: weeks.filter((week) => week.onTime).length,
    onTimePct:
      weeks.length === 0
        ? null
        : Math.round((weeks.filter((week) => week.onTime).length / weeks.length) * 100),
    avgDietCompliance: average(weeks.map((week) => week.dietCompliance)),
    avgTrainingCompliance: average(weeks.map((week) => week.trainingCompliance)),
    lastCheckIn: last?.date ?? null,
    daysSinceLastCheckIn: last ? daysBetween(last.date, todayISO) : null,
  };

  // ---- Escalamiento -------------------------------------------------------

  let outOfConfig: OutOfConfigFinding | null = null;
  const latestDecision = timeline[0] ?? null;

  if (athlete.profile && latestDecision) {
    try {
      const config = loadConfig(
        (athlete.profile.engineConfig ?? undefined) as Parameters<typeof loadConfig>[0],
      );
      const latestWeight =
        [...weeks].reverse().map((week) => week.weightKg).find((value) => value !== null) ?? null;
      const engineProfile = toEngineProfile(athlete.profile, latestWeight);

      outOfConfig = findOutOfConfig({
        latest: {
          date: latestDecision.date,
          phase: latestDecision.phase,
          kcal: latestDecision.kcal,
        },
        weeksInPhase: weeksInCurrentPhase(
          timeline.slice().reverse().map((entry) => entry.phase),
        ),
        kcalFloorValue: kcalFloor(engineProfile, config),
        config,
      });
    } catch {
      // Config rota o perfil sin peso: no hay con qué comparar, no se escala.
      outOfConfig = null;
    }
  }

  const escalationWeeks: EscalationWeek[] = ordered.map((checkIn) => ({
    date: toISODate(checkIn.date),
    symptoms: checkIn.symptoms,
    dietCompliance: checkIn.dietCompliance,
    trainingCompliance: checkIn.trainingCompliance,
  }));

  const escalations = detectEscalations({
    weeks: escalationWeeks,
    today: todayISO,
    outOfConfig,
  });

  // ---- Propuestas ---------------------------------------------------------

  const proposals = buildProposals({
    tops,
    photoWeeks: weeks.map((week) => ({ date: week.date, views: week.photoViews })),
    comments: ordered
      .filter((checkIn) => checkIn.comment)
      .map((checkIn) => ({ date: toISODate(checkIn.date), text: checkIn.comment ?? "" })),
  });

  return {
    athlete: {
      id: athlete.id,
      name: athlete.profile?.displayName ?? athlete.email,
      email: athlete.email,
    },
    currentPhase: athlete.profile?.currentPhase ?? null,
    currentKcal: latestDecision?.kcal ?? null,
    weeks,
    waistForecast: forecast(waistPoints, 4),
    strength,
    personalRecords,
    adherence,
    timeline,
    proposals,
    escalations,
  };
}
