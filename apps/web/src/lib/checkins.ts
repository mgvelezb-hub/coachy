import "server-only";

import type { CheckIn, Photo } from "@prisma/client";

import { decimalToNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export type CheckInWithPhotos = CheckIn & { photos: Photo[] };

/** Serie plana para gráficas: números y fechas ISO, sin Decimal ni Date. */
export interface CheckInPoint {
  id: string;
  date: string;
  waistCm: number | null;
  weightKg: number | null;
  legLeftCm: number | null;
  legRightCm: number | null;
  armLeftCm: number | null;
  armRightCm: number | null;
  inflammation: number;
  energy: number;
  dietCompliance: number;
  phase: string | null;
}

/**
 * El "punto cero" declarado por la persona: desde dónde se compara TODO.
 *
 * Quien vuelve a entrenar después de meses parada arrastra un historial que
 * ya no la describe. Comparar sus medidas de hoy contra las de hace un año
 * pinta como retroceso lo que en realidad es el arranque de una etapa nueva,
 * y esa lectura desanima justo a quien más necesita seguir. Al marcar un
 * check-in como punto cero, la vara se mueve ahí: el historial viejo se
 * conserva —nunca se borra nada— pero deja de ser la referencia.
 *
 * `null` = no hay punto cero declarado; la vara es el primer check-in, como
 * siempre fue.
 */
export async function puntoCeroDe(
  userId: string,
): Promise<{ checkInId: string; date: Date } | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { baselineCheckIn: { select: { id: true, date: true } } },
  });

  const baseline = profile?.baselineCheckIn;
  return baseline ? { checkInId: baseline.id, date: baseline.date } : null;
}

/** `{ date: { gte } }` cuando hay punto cero; `{}` cuando no. Para componer `where`. */
export async function desdePuntoCero(userId: string): Promise<{ date?: { gte: Date } }> {
  const punto = await puntoCeroDe(userId);
  return punto ? { date: { gte: punto.date } } : {};
}

/** Check-ins de un atleta, del más viejo al más nuevo. */
export async function listCheckIns(userId: string): Promise<CheckInWithPhotos[]> {
  return prisma.checkIn.findMany({
    where: { userId, ...(await desdePuntoCero(userId)) },
    orderBy: { date: "asc" },
    include: { photos: true },
  });
}

/** El check-in inmediatamente anterior a una fecha, con sus fotos. */
export async function previousCheckIn(
  userId: string,
  before: Date,
): Promise<CheckInWithPhotos | null> {
  return prisma.checkIn.findFirst({
    where: { userId, date: { lt: before } },
    orderBy: { date: "desc" },
    include: { photos: true },
  });
}

/**
 * El "día 1" del comparador de fotos: el punto cero si la persona declaró
 * uno, y si no el primer check-in que exista. Es la misma pregunta —"¿contra
 * qué me comparo?"— y por eso vive en una sola función.
 */
export async function firstCheckIn(userId: string): Promise<CheckInWithPhotos | null> {
  return prisma.checkIn.findFirst({
    where: { userId, ...(await desdePuntoCero(userId)) },
    orderBy: { date: "asc" },
    include: { photos: true },
  });
}

export async function toChartSeries(userId: string): Promise<CheckInPoint[]> {
  const checkIns = await prisma.checkIn.findMany({
    // La gráfica arranca en el punto cero: una curva que empieza un año antes
    // de la etapa actual no informa, entierra.
    where: { userId, ...(await desdePuntoCero(userId)) },
    orderBy: { date: "asc" },
    include: { decision: { select: { phase: true } } },
  });

  return checkIns.map((checkIn) => ({
    id: checkIn.id,
    date: checkIn.date.toISOString().slice(0, 10),
    waistCm: decimalToNumber(checkIn.waistCm),
    weightKg: decimalToNumber(checkIn.weightKg),
    legLeftCm: decimalToNumber(checkIn.legLeftCm),
    legRightCm: decimalToNumber(checkIn.legRightCm),
    armLeftCm: decimalToNumber(checkIn.armLeftCm),
    armRightCm: decimalToNumber(checkIn.armRightCm),
    inflammation: checkIn.inflammation,
    energy: checkIn.energy,
    dietCompliance: checkIn.dietCompliance,
    phase: checkIn.decision?.phase ?? null,
  }));
}
