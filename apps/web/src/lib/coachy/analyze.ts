import "server-only";

import type { CheckIn, Decision, DecisionStatus, Photo, Profile, User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { decide } from "engine";

import { engineConfigForActivity, toEngineCheckIn, toEngineProfile } from "@/lib/coachy/mapping";
import { activityWindow } from "@/lib/health/db";
import type { VisionAnalysis, WeekSignals } from "@/lib/coachy/types";
import { analyzePhotos } from "@/lib/coachy/vision";
import type { EngineDecision } from "@/lib/engine-types";
import { decimalToNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireApproval } from "@/lib/env";

/**
 * Paso 1 del pipeline: el motor decide.
 *
 * Reconstruye el historial del atleta, lo traduce a los tipos del motor, corre
 * `decide()` y guarda la `Decision`. Si `REQUIRE_APPROVAL` está prendido la
 * decisión nace `PENDIENTE` y no se publica hasta que el admin la apruebe.
 *
 * Aquí no hay IA que decida nada: la visión solo aporta `photosTrend`, que es
 * una señal más de entrada al motor.
 */

export class CheckInNotFoundError extends Error {
  constructor(checkInId: string) {
    super(`No existe el check-in ${checkInId}.`);
    this.name = "CheckInNotFoundError";
  }
}

export class MissingOnboardingError extends Error {
  constructor() {
    super("El atleta no terminó el onboarding: no hay perfil con el que calcular.");
    this.name = "MissingOnboardingError";
  }
}

export interface AnalysisResult {
  checkIn: CheckIn & { photos: Photo[] };
  user: User;
  profile: Profile;
  decision: Decision;
  engineDecision: EngineDecision;
  vision: VisionAnalysis | null;
  signals: WeekSignals;
  /** Preguntas que se hicieron la semana pasada, para no repetirlas. */
  askedLastWeek: string[];
  /** La fase cambió respecto a la decisión anterior. */
  phaseChanged: boolean;
  /** El motor pide otra semilla de menú (toca quincena). */
  menuSeedChanged: boolean;
  /** Peso más reciente del historial: el del perfil puede estar viejo. */
  latestWeightKg: number | null;
}

function buildSignals(
  checkIn: CheckIn,
  previous: CheckIn | null,
  first: CheckIn | null,
  engineDecision: EngineDecision,
): WeekSignals {
  const waist = decimalToNumber(checkIn.waistCm);
  const previousWaist = previous ? decimalToNumber(previous.waistCm) : null;
  const firstWaist = first ? decimalToNumber(first.waistCm) : null;
  const weight = decimalToNumber(checkIn.weightKg);
  const previousWeight = previous ? decimalToNumber(previous.weightKg) : null;

  const round1 = (value: number): number => Math.round(value * 10) / 10;

  return {
    fecha: checkIn.date.toISOString().slice(0, 10),
    cinturaCm: waist,
    cinturaDeltaCm: waist !== null && previousWaist !== null ? round1(waist - previousWaist) : null,
    cinturaDeltaDesdeInicioCm:
      waist !== null && firstWaist !== null ? round1(waist - firstWaist) : null,
    pesoKg: weight,
    pesoDeltaKg:
      weight !== null && previousWeight !== null ? round1(weight - previousWeight) : null,
    inflamacion: checkIn.inflammation,
    energia: checkIn.energy,
    hambre: checkIn.hunger,
    saciedad: checkIn.satiety,
    sueno: checkIn.sleep,
    fuerzaRpe: checkIn.strengthRpe,
    fuerzaTendencia: checkIn.strengthTrend ? checkIn.strengthTrend.toLowerCase() : null,
    cumplimientoDieta: checkIn.dietCompliance,
    cumplimientoEntreno: checkIn.trainingCompliance,
    sintomas: checkIn.symptoms,
    faseCiclo: checkIn.cyclePhase ? checkIn.cyclePhase.toLowerCase() : null,
    comentario: checkIn.comment,
    semanasEnFase: engineDecision.weeksInPhase,
    semanasSinProgreso: engineDecision.stallWeeks,
  };
}

export async function runCheckinAnalysis(checkInId: string): Promise<AnalysisResult> {
  const checkIn = await prisma.checkIn.findUnique({
    where: { id: checkInId },
    include: { photos: true, user: { include: { profile: true } } },
  });

  if (!checkIn) throw new CheckInNotFoundError(checkInId);

  const { user } = checkIn;
  const profile = user.profile;
  if (!profile) throw new MissingOnboardingError();

  const history = await prisma.checkIn.findMany({
    where: { userId: user.id, date: { lte: checkIn.date } },
    orderBy: { date: "asc" },
    include: { photos: true },
  });

  const previous = history.length > 1 ? (history[history.length - 2] ?? null) : null;
  const first = history[0] ?? null;

  const vision = await analyzePhotos({
    profile,
    current: checkIn.photos,
    previous: previous?.photos ?? [],
    baseline: first && first.id !== checkIn.id ? first.photos : [],
  });

  const latestWeight =
    [...history].reverse().map((row) => decimalToNumber(row.weightKg)).find((w) => w !== null) ??
    null;

  const engineProfile = toEngineProfile(profile, latestWeight);
  const activeInjury = profile.conditions
    .map((condition) => condition.toLowerCase())
    .includes("lesion_activa");

  const engineHistory = history.map((row) =>
    toEngineCheckIn(row, {
      photosTrend: row.id === checkIn.id ? (vision?.trend ?? null) : null,
      activeInjury,
    }),
  );

  // PAL dinámico (Fase 8): con dos semanas de pasos del reloj, el término base
  // del PAL se corrige por banda de actividad. Sin datos, `null` y el motor
  // corre con sus defaults de siempre.
  const activity = await activityWindow(user.id, checkIn.date).catch(() => null);
  const engineActivity = engineConfigForActivity(activity);

  const engineDecision = decide(engineHistory, engineProfile, engineActivity?.config);

  const previousDecision = await prisma.decision.findFirst({
    where: { userId: user.id, checkIn: { date: { lt: checkIn.date } } },
    orderBy: { checkIn: { date: "desc" } },
  });

  const status: DecisionStatus = requireApproval() ? "PENDIENTE" : "APROBADA";
  const now = new Date();

  const payload = {
    userId: user.id,
    phase: engineDecision.phase,
    kcal: engineDecision.targets.kcal,
    proteinG: engineDecision.targets.proteinG,
    fatG: engineDecision.targets.fatG,
    carbsG: engineDecision.targets.carbG,
    fiberG: engineDecision.targets.fiberG,
    menuSeed: engineDecision.menuSeed,
    rules: engineDecision.rulesFired as unknown as Prisma.InputJsonValue,
    explanation: engineDecision.explicacion,
    visionJson: (vision ?? Prisma.DbNull) as Prisma.InputJsonValue | Prisma.NullTypes.DbNull,
    status,
    publishedAt: status === "APROBADA" ? now : null,
    approvedAt: null,
  };

  const decision = await prisma.decision.upsert({
    where: { checkInId: checkIn.id },
    create: { checkInId: checkIn.id, ...payload },
    update: payload,
  });

  // El análisis de visión también se guarda en cada foto: así el comparador del
  // historial puede mostrar el cambio por zona sin releer la decisión.
  if (vision) {
    await prisma.photo.updateMany({
      where: { checkInId: checkIn.id },
      data: { analysisJson: vision as unknown as Prisma.InputJsonValue },
    });
  }

  return {
    checkIn,
    user,
    profile,
    decision,
    engineDecision,
    vision,
    signals: buildSignals(checkIn, previous, first, engineDecision),
    askedLastWeek: previousDecision?.questionIds ?? [],
    phaseChanged: previousDecision ? previousDecision.phase !== engineDecision.phase : true,
    menuSeedChanged: previousDecision?.menuSeed !== engineDecision.menuSeed,
    latestWeightKg: latestWeight,
  };
}
