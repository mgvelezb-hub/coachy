import "server-only";

import { fromISODate, isoFromDateColumn } from "@/lib/format";
import type { GolfPracticaInput, GolfRondaInput } from "@/lib/golf-schema";
import { prisma } from "@/lib/prisma";

/**
 * Persistencia de `GolfRound` y `GolfPractice`.
 *
 * Sin idempotencia por `externalId` como `activity/db.ts`: a diferencia de un
 * workout de HealthKit, una ronda o una sesión de práctica de golf no llegan
 * de un reloj que pueda reenviar el mismo evento dos veces — cada POST es una
 * fila nueva, capturada a mano después de jugar o practicar.
 */

export type GolfRoundRecord = {
  id: string;
  date: string;
  holes: number;
  score: number;
  par: number | null;
  putts: number | null;
  fairwaysHit: number | null;
  fairwaysTotal: number | null;
  girHit: number | null;
  penalties: number | null;
  course: string | null;
  notes: string | null;
};

export type GolfPracticeRecord = {
  id: string;
  date: string;
  kind: string;
  minutes: number;
  balls: number | null;
  notes: string | null;
};

export async function saveGolfRonda(userId: string, input: GolfRondaInput): Promise<GolfRoundRecord> {
  const row = await prisma.golfRound.create({
    data: {
      userId,
      date: fromISODate(input.date),
      holes: input.holes,
      score: input.score,
      par: input.par ?? null,
      putts: input.putts ?? null,
      fairwaysHit: input.fairwaysHit ?? null,
      fairwaysTotal: input.fairwaysTotal ?? null,
      girHit: input.girHit ?? null,
      penalties: input.penalties ?? null,
      course: input.course ?? null,
      notes: input.notes ?? null,
    },
  });

  return {
    id: row.id,
    date: isoFromDateColumn(row.date),
    holes: row.holes,
    score: row.score,
    par: row.par,
    putts: row.putts,
    fairwaysHit: row.fairwaysHit,
    fairwaysTotal: row.fairwaysTotal,
    girHit: row.girHit,
    penalties: row.penalties,
    course: row.course,
    notes: row.notes,
  };
}

export async function saveGolfPractica(
  userId: string,
  input: GolfPracticaInput,
): Promise<GolfPracticeRecord> {
  const row = await prisma.golfPractice.create({
    data: {
      userId,
      date: fromISODate(input.date),
      kind: input.kind,
      minutes: input.minutes,
      balls: input.balls ?? null,
      notes: input.notes ?? null,
    },
  });

  return {
    id: row.id,
    date: isoFromDateColumn(row.date),
    kind: row.kind,
    minutes: row.minutes,
    balls: row.balls,
    notes: row.notes,
  };
}

/** Las últimas `take` rondas, de la más reciente a la más vieja. */
export async function recentGolfRondas(userId: string, take = 20): Promise<GolfRoundRecord[]> {
  const rows = await prisma.golfRound.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take,
  });

  return rows.map((row) => ({
    id: row.id,
    date: isoFromDateColumn(row.date),
    holes: row.holes,
    score: row.score,
    par: row.par,
    putts: row.putts,
    fairwaysHit: row.fairwaysHit,
    fairwaysTotal: row.fairwaysTotal,
    girHit: row.girHit,
    penalties: row.penalties,
    course: row.course,
    notes: row.notes,
  }));
}

/** Las prácticas de los últimos `days` días, de la más reciente a la más vieja. */
export async function recentGolfPracticas(userId: string, days = 30): Promise<GolfPracticeRecord[]> {
  const desde = new Date();
  desde.setDate(desde.getDate() - days);

  const rows = await prisma.golfPractice.findMany({
    where: { userId, date: { gte: desde } },
    orderBy: { date: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    date: isoFromDateColumn(row.date),
    kind: row.kind,
    minutes: row.minutes,
    balls: row.balls,
    notes: row.notes,
  }));
}

/**
 * Rondas para el cálculo de agregados: más que las 20 que ve la app (la
 * tendencia y el diferencial miran hasta 10-20 rondas hacia atrás, y con
 * exactamente 20 en pantalla un usuario activo nunca tendría margen). 60
 * cubre sobrado incluso a quien juega semanalmente todo el año.
 */
export async function golfRondasParaAgregados(userId: string): Promise<GolfRoundRecord[]> {
  return recentGolfRondas(userId, 60);
}
