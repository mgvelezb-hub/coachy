"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { requireAdmin } from "@/lib/auth";
import { fromISODate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { parseAthleteImport, type ImportedCheckIn } from "@/lib/validation/import";

export type ImportState = {
  status: "idle" | "error" | "success";
  message: string | null;
  errors: string[];
  summary: { checkIns: number; decisions: number; trainingExamples: number } | null;
};

export const EMPTY_IMPORT_STATE: ImportState = {
  status: "idle",
  message: null,
  errors: [],
  summary: null,
};

function dec(value: number | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  return value.toFixed(1) as unknown as Prisma.Decimal;
}

function checkInData(entry: ImportedCheckIn) {
  return {
    weightKg: dec(entry.weightKg),
    waistCm: dec(entry.waistCm),
    legLeftCm: dec(entry.legLeftCm),
    legRightCm: dec(entry.legRightCm),
    armLeftCm: dec(entry.armLeftCm),
    armRightCm: dec(entry.armRightCm),
    inflammation: entry.inflammation,
    energy: entry.energy,
    hunger: entry.hunger,
    satiety: entry.satiety,
    sleep: entry.sleep,
    strengthRpe: entry.strengthRpe ?? null,
    strengthTrend: entry.strengthTrend ?? null,
    dietCompliance: entry.dietCompliance,
    trainingCompliance: entry.trainingCompliance,
    symptoms: entry.symptoms,
    cyclePhase: entry.cyclePhase ?? null,
    comment: entry.comment ?? null,
  };
}

/**
 * Carga el historial privado de un atleta desde un JSON.
 *
 * Es a propósito la única puerta de entrada: el repo es público y no lleva
 * seeds con datos de personas. El archivo nunca toca el disco del servidor —
 * se lee del FormData, se valida y se escribe a la DB.
 */
export async function importAthleteHistory(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireAdmin();

  const file = formData.get("file");
  const pasted = String(formData.get("json") ?? "").trim();

  let text = pasted;
  if (file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) {
      return { ...EMPTY_IMPORT_STATE, status: "error", message: "El archivo pesa más de 5 MB." };
    }
    text = await file.text();
  }

  if (!text) {
    return { ...EMPTY_IMPORT_STATE, status: "error", message: "Sube un archivo o pega el JSON." };
  }

  const parsed = parseAthleteImport(text);
  if (!parsed.ok) {
    return {
      ...EMPTY_IMPORT_STATE,
      status: "error",
      message: "El JSON no cumple el formato esperado.",
      errors: parsed.errors,
    };
  }

  const { athleteEmail, checkIns, trainingExamples } = parsed.data;

  const athlete = await prisma.user.findUnique({
    where: { email: athleteEmail.toLowerCase() },
  });

  if (!athlete) {
    return {
      ...EMPTY_IMPORT_STATE,
      status: "error",
      message: `No hay ninguna cuenta con el correo ${athleteEmail}. Pídele que se registre primero.`,
    };
  }

  let decisionCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const entry of checkIns) {
      const date = fromISODate(entry.date);
      const data = checkInData(entry);

      const checkIn = await tx.checkIn.upsert({
        where: { userId_date: { userId: athlete.id, date } },
        create: { userId: athlete.id, date, ...data },
        update: data,
      });

      if (!entry.decision) continue;

      const decision = {
        userId: athlete.id,
        phase: entry.decision.phase,
        kcal: entry.decision.kcal,
        proteinG: entry.decision.proteinG,
        fatG: entry.decision.fatG,
        carbsG: entry.decision.carbsG,
        fiberG: entry.decision.fiberG ?? null,
        rules: entry.decision.rules,
        explanation: entry.decision.explanation,
        status: entry.decision.status,
        approvedAt: entry.decision.status === "PENDIENTE" ? null : new Date(),
      };

      await tx.decision.upsert({
        where: { checkInId: checkIn.id },
        create: { checkInId: checkIn.id, ...decision },
        update: decision,
      });
      decisionCount += 1;
    }

    for (const example of trainingExamples) {
      await tx.trainingExample.create({
        data: {
          userId: athlete.id,
          contextJson: example.context as Prisma.InputJsonValue,
          approvedResponse: example.approvedResponse,
          source: example.source,
        },
      });
    }
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/atletas/${athlete.id}`);

  return {
    status: "success",
    message: `Historial de ${athleteEmail} cargado.`,
    errors: [],
    summary: {
      checkIns: checkIns.length,
      decisions: decisionCount,
      trainingExamples: trainingExamples.length,
    },
  };
}
