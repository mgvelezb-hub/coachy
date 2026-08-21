import type { CheckIn, Prisma } from "@prisma/client";

import { fromISODate } from "@/lib/format";
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
    sleep: input.sleep,
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
