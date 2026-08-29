import type { CheckIn, Prisma } from "@prisma/client";

import { fromISODate } from "@/lib/format";
import { sleepScoreFor } from "@/lib/health/db";
import { prisma } from "@/lib/prisma";
import type { CheckInInput } from "@/lib/validation/checkin";

/** number → Decimal(5,1) tal como lo espera Prisma. */
function dec(value: number | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  return value.toFixed(1) as unknown as Prisma.Decimal;
}

/**
 * Escribe el check-in de la semana.
 *
 * Vive fuera de la server action a propósito: así se puede probar contra una
 * base real sin montar sesión de Supabase, y la action se queda solo con
 * autenticación, validación y fotos.
 *
 * Idempotente por `(userId, date)`: reenviar el mismo domingo corrige, no
 * duplica.
 */
export async function persistCheckIn(userId: string, input: CheckInInput): Promise<CheckIn> {
  const date = fromISODate(input.date);

  // `otro` se guarda como texto, no como un chip que nadie puede leer después.
  const comment =
    input.symptoms.includes("otro") && input.otherSymptom
      ? [input.comment, `Otro síntoma: ${input.otherSymptom}`].filter(Boolean).join("\n")
      : (input.comment ?? null);

  /**
   * El sueño ya no se pregunta en la app: se deriva de las noches que subió el
   * reloj. Si no hay ni una noche registrada se guarda un 3 —el punto medio de
   * la escala—, que es lo que el motor entiende como "sin señal" y no lo
   * empuja ni a favor ni en contra.
   */
  const sleep = input.sleep ?? (await sleepScoreFor(userId, input.date)) ?? 3;

  const data = {
    weightKg: dec(input.weightKg),
    waistCm: dec(input.waistCm),
    legLeftCm: dec(input.legLeftCm),
    legRightCm: dec(input.legRightCm),
    armLeftCm: dec(input.armLeftCm),
    armRightCm: dec(input.armRightCm),
    inflammation: input.inflammation,
    energy: input.energy,
    hunger: input.hunger,
    satiety: input.satiety,
    sleep,
    strengthRpe: input.strengthRpe ?? null,
    strengthTrend: input.strengthTrend ?? null,
    dietCompliance: input.dietCompliance,
    trainingCompliance: input.trainingCompliance,
    symptoms: input.symptoms,
    cyclePhase: input.cyclePhase ?? null,
    comment: comment || null,
  };

  return prisma.checkIn.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, ...data },
    update: data,
  });
}
