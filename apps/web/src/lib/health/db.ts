import "server-only";

import { randomUUID } from "node:crypto";

import { fromISODate, isoFromDateColumn } from "@/lib/format";
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
