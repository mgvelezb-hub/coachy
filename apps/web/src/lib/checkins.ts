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

/** Check-ins de un atleta, del más viejo al más nuevo. */
export async function listCheckIns(userId: string): Promise<CheckInWithPhotos[]> {
  return prisma.checkIn.findMany({
    where: { userId },
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

/** El primer check-in del atleta — el "día 1" del comparador de fotos. */
export async function firstCheckIn(userId: string): Promise<CheckInWithPhotos | null> {
  return prisma.checkIn.findFirst({
    where: { userId },
    orderBy: { date: "asc" },
    include: { photos: true },
  });
}

export async function toChartSeries(userId: string): Promise<CheckInPoint[]> {
  const checkIns = await prisma.checkIn.findMany({
    where: { userId },
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
