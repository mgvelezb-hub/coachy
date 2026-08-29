import "server-only";

import { randomUUID } from "node:crypto";

import { decimalToNumber, fromISODate, isoFromDateColumn } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  ACTIVITY_WINDOW_DAYS,
  summarizeActivity,
  type ActivityWindow,
  type HealthDayInput,
} from "@/lib/health/activity";
import type { HealthDayPayload } from "@/lib/health/schema";

/**
 * Persistencia de los días del reloj (Fase 8).
 *
 * No hay app nativa: un Atajo de iOS lee Salud y hace POST con el token del
 * atleta. Por eso el token es una credencial de verdad — se guarda en
 * `profiles.health_ingest_token`, se puede regenerar, y ni el endpoint ni los
 * logs lo escriben nunca.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El token del atleta, creándolo la primera vez que alguien lo pide. */
export async function ensureHealthToken(userId: string): Promise<string> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { healthIngestToken: true },
  });
  if (profile?.healthIngestToken) return profile.healthIngestToken;

  const token = randomUUID();
  await prisma.profile.update({ where: { userId }, data: { healthIngestToken: token } });
  return token;
}

/** Estrena token. El atajo viejo deja de funcionar en ese instante. */
export async function regenerateHealthToken(userId: string): Promise<string> {
  const token = randomUUID();
  await prisma.profile.update({ where: { userId }, data: { healthIngestToken: token } });
  return token;
}

/**
 * De token a dueño.
 *
 * El formato se revisa antes de consultar: un token con forma inválida ni
 * siquiera toca la base, y la respuesta es la misma que la de uno inexistente.
 */
export async function userIdForToken(token: string): Promise<string | null> {
  if (!UUID_RE.test(token)) return null;

  const profile = await prisma.profile.findUnique({
    where: { healthIngestToken: token },
    select: { userId: true },
  });
  return profile?.userId ?? null;
}

/**
 * Guarda los días recibidos. Idempotente por `(user, date)`.
 *
 * Un campo que no vino **no borra** el que ya estaba: el atajo de la mañana
 * puede traer pasos y el de la noche el sueño, y los dos caben en la misma
 * fila sin pisarse.
 */
export async function upsertHealthDays(
  userId: string,
  days: HealthDayPayload[],
  source = "atajo-ios",
): Promise<number> {
  let saved = 0;

  for (const day of days) {
    const values = {
      ...(day.steps === null || day.steps === undefined ? {} : { steps: day.steps }),
      ...(day.activeKcal === null || day.activeKcal === undefined
        ? {}
        : { activeKcal: day.activeKcal }),
      ...(day.exerciseMin === null || day.exerciseMin === undefined
        ? {}
        : { exerciseMin: day.exerciseMin }),
      ...(day.sleepMin === null || day.sleepMin === undefined ? {} : { sleepMin: day.sleepMin }),
      ...(day.restingHr === null || day.restingHr === undefined
        ? {}
        : { restingHr: day.restingHr }),
      ...(day.hrvMs === null || day.hrvMs === undefined ? {} : { hrvMs: day.hrvMs }),
      ...(day.vo2max === null || day.vo2max === undefined
        ? {}
        : { vo2max: day.vo2max.toFixed(1) }),
      ...(day.respiratoryRate === null || day.respiratoryRate === undefined
        ? {}
        : { respiratoryRate: day.respiratoryRate.toFixed(1) }),
      ...(day.spo2 === null || day.spo2 === undefined ? {} : { spo2: day.spo2.toFixed(1) }),
      ...(day.standHours === null || day.standHours === undefined
        ? {}
        : { standHours: day.standHours }),
    };

    await prisma.healthDay.upsert({
      where: { userId_date: { userId, date: fromISODate(day.date) } },
      create: { userId, date: fromISODate(day.date), source, ...values },
      update: { source, ...values },
    });
    saved += 1;
  }

  return saved;
}

/** Los últimos `take` días guardados, del más reciente al más viejo. */
export async function recentHealthDays(userId: string, take = 7): Promise<HealthDayInput[]> {
  const rows = await prisma.healthDay.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take,
  });

  return rows.map((row) => ({
    date: isoFromDateColumn(row.date),
    steps: row.steps,
    activeKcal: row.activeKcal,
    exerciseMin: row.exerciseMin,
    sleepMin: row.sleepMin,
    restingHr: row.restingHr,
    hrvMs: row.hrvMs,
    vo2max: decimalToNumber(row.vo2max),
    respiratoryRate: decimalToNumber(row.respiratoryRate),
    spo2: decimalToNumber(row.spo2),
    standHours: row.standHours,
  }));
}

/**
 * La ventana de actividad que alimenta el PAL dinámico: los últimos
 * `ACTIVITY_WINDOW_DAYS` días. `null` si esa persona no tiene ni un día.
 */
export async function activityWindow(
  userId: string,
  reference: Date = new Date(),
): Promise<ActivityWindow | null> {
  const from = new Date(reference);
  from.setDate(from.getDate() - ACTIVITY_WINDOW_DAYS);

  const rows = await prisma.healthDay.findMany({
    where: { userId, date: { gte: from, lte: reference } },
    orderBy: { date: "desc" },
  });

  return summarizeActivity(
    rows.map((row) => ({ date: isoFromDateColumn(row.date), steps: row.steps, sleepMin: row.sleepMin })),
  );
}

/**
 * Minutos dormidos la noche que terminó esa mañana.
 *
 * El Atajo guarda el sueño en el día en que se despertó, así que la nota de
 * readiness de hoy se lee de la fila de hoy.
 */
export async function sleepMinutesFor(userId: string, isoDate: string): Promise<number | null> {
  const row = await prisma.healthDay.findUnique({
    where: { userId_date: { userId, date: fromISODate(isoDate) } },
    select: { sleepMin: true },
  });
  return row?.sleepMin ?? null;
}

/**
 * El descanso de la semana, traducido a la escala 1-5 del check-in.
 *
 * Existe porque el check-in dejó de preguntar por el sueño: el reloj ya sube
 * los minutos exactos de cada noche, y pedirle a alguien que califique del 1
 * al 5 lo que la app mide mejor es puro trámite. Los cortes son los mismos con
 * los que se evalúa el descanso en la app: 7 h es el objetivo y 6 h el piso.
 *
 * `null` cuando no hay ni una noche registrada — ahí el que llama decide qué
 * hacer, porque inventar un 3 sería meterle ruido al motor.
 */
export async function sleepScoreFor(userId: string, isoDate: string): Promise<number | null> {
  const hasta = fromISODate(isoDate);
  const desde = new Date(hasta);
  desde.setDate(desde.getDate() - 6);

  const filas = await prisma.healthDay.findMany({
    where: { userId, date: { gte: desde, lte: hasta }, sleepMin: { not: null } },
    select: { sleepMin: true },
  });
  if (filas.length === 0) return null;

  const promedio =
    filas.reduce((suma, fila) => suma + (fila.sleepMin ?? 0), 0) / filas.length;

  if (promedio >= 8 * 60) return 5;
  if (promedio >= 7 * 60) return 4;
  if (promedio >= 6 * 60) return 3;
  if (promedio >= 5 * 60) return 2;
  return 1;
}

export type HealthStatus = {
  /** Último día recibido, ISO `YYYY-MM-DD`. `null` si nunca llegó nada. */
  lastDate: string | null;
  days: number;
  avgSteps: number | null;
  avgSleepMin: number | null;
};

/** Lo que la tarjeta del atleta necesita: qué tan al día está el reloj. */
export async function healthStatus(userId: string, window = 7): Promise<HealthStatus> {
  const days = await recentHealthDays(userId, window);
  const summary = summarizeActivity(days);

  return {
    lastDate: days[0]?.date ?? null,
    days: days.length,
    avgSteps: summary && summary.days > 0 ? summary.avgSteps : null,
    avgSleepMin: summary?.avgSleepMin ?? null,
  };
}
