"use server";

import type { CheckInState } from "./state";
export type { CheckInState };
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { Prisma } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth";
import { persistCheckIn } from "@/lib/checkin-write";
import { runCoachy } from "@/lib/coachy";
import { prisma } from "@/lib/prisma";
import { photoPath, uploadProgressPhoto } from "@/lib/storage";
import {
  PHOTO_VIEWS,
  checkInSchema,
  coerceCheckInPayload,
  validatePhotoFile,
} from "@/lib/validation/checkin";

/**
 * Guarda el check-in de la semana y sube las fotos al bucket privado.
 *
 * Las medidas se escriben primero: si una foto falla (red mala en el gym), el
 * check-in ya quedó y la atleta no pierde lo que capturó.
 */
export async function submitCheckIn(
  _prev: CheckInState,
  formData: FormData,
): Promise<CheckInState> {
  const user = await requireOnboardedUser();

  const raw = {
    ...Object.fromEntries(formData.entries()),
    symptoms: formData.getAll("symptoms"),
  };

  const parsed = checkInSchema.safeParse(coerceCheckInPayload(raw));

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      status: "error",
      message: "Faltan datos o hay algo fuera de rango.",
      fieldErrors,
      warnings: [],
    };
  }

  const checkIn = await persistCheckIn(user.id, parsed.data);

  const warnings: string[] = [];

  for (const view of PHOTO_VIEWS) {
    const file = formData.get(`photo_${view}`);
    if (!(file instanceof File) || file.size === 0) continue;

    const check = validatePhotoFile(file);
    if (!check.ok) {
      warnings.push(`Foto ${view.toLowerCase()}: ${check.error}`);
      continue;
    }

    const path = photoPath(user.id, checkIn.id, view);
    const upload = await uploadProgressPhoto(path, file, file.type || "image/jpeg");

    if (!upload.ok) {
      warnings.push(`Foto ${view.toLowerCase()}: no se pudo subir (${upload.error})`);
      continue;
    }

    await prisma.photo.upsert({
      where: { checkInId_view: { checkInId: checkIn.id, view } },
      create: { checkInId: checkIn.id, view, storagePath: path },
      // Foto nueva: el análisis de visión anterior deja de ser válido.
      update: { storagePath: path, analysisJson: Prisma.DbNull },
    });
  }

  // Coachy corre DESPUÉS de contestarle a la atleta: el motor y Claude tardan
  // segundos y ella no tiene por qué esperarlos. Si truena, la cola de
  // `/api/coachy/run` lo reintenta.
  after(async () => {
    try {
      await runCoachy(checkIn.id);
    } catch (error) {
      console.error("[coachy] falló el análisis del check-in", checkIn.id, error);
    }
  });

  revalidatePath("/app", "layout");

  return {
    status: "success",
    message: "Listo, tu check-in quedó guardado.",
    fieldErrors: {},
    warnings,
  };
}
