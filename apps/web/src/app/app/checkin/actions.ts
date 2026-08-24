"use server";

import type { CheckInState } from "./state";
export type { CheckInState };
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { Prisma } from "@prisma/client";

import { requireOnboardedUser, type SessionUser } from "@/lib/auth";
import { persistCheckIn } from "@/lib/checkin-write";
import { runCoachy } from "@/lib/coachy";
import {
  DEFAULT_CYCLE_LENGTH,
  estimateCyclePhase,
  parseCycleSettings,
  type CyclePhaseName,
} from "@/lib/cycle";
import { fromISODate, toISODate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { photoPath, uploadProgressPhoto } from "@/lib/storage";
import {
  PHOTO_VIEWS,
  checkInSchema,
  coerceCheckInPayload,
  validatePhotoFile,
  type CheckInInput,
} from "@/lib/validation/checkin";

/**
 * Ciclo menstrual (Fase 7): guarda lo que ella escribió y devuelve la fase
 * estimada de la semana.
 *
 * Tres cosas pasan aquí, en este orden:
 *
 * 1. Si marcó "empezó mi periodo", esa fecha reancla el conteo. Es la forma más
 *    barata de mantener viva una estimación de calendario.
 * 2. Si tocó el bloque de ajustes (opt-in, fecha, duración), se guarda.
 * 3. Con el tracking encendido se calcula la fase de la semana del check-in.
 *
 * El bloque es opcional de punta a punta: si viene roto o incompleto se ignora.
 * El ciclo nunca debe impedir que un check-in se guarde.
 */
async function syncCycle(
  user: SessionUser,
  formData: FormData,
  input: CheckInInput,
): Promise<CyclePhaseName | null> {
  const profile = user.profile;
  if (!profile) return null;

  const raw = Object.fromEntries(formData.entries());
  const submitted = parseCycleSettings(raw);
  const touchedSettings = formData.has("cycleSettingsPresent");

  let enabled = profile.cycleTrackingEnabled;
  let lastPeriodStart = profile.cycleLastPeriodStart
    ? toISODate(profile.cycleLastPeriodStart)
    : null;
  let avgLength = profile.cycleAvgLength || DEFAULT_CYCLE_LENGTH;

  if (touchedSettings && submitted) {
    enabled = submitted.cycleTrackingEnabled;
    if (submitted.cycleLastPeriodStart) lastPeriodStart = submitted.cycleLastPeriodStart;
    avgLength = submitted.cycleAvgLength;
  }

  // "Empezó mi periodo" manda sobre cualquier fecha vieja: es el dato más nuevo.
  if (input.periodStarted) {
    lastPeriodStart = input.date;
    enabled = true;
  }

  const changed =
    enabled !== profile.cycleTrackingEnabled ||
    avgLength !== profile.cycleAvgLength ||
    lastPeriodStart !==
      (profile.cycleLastPeriodStart ? toISODate(profile.cycleLastPeriodStart) : null);

  if (changed) {
    await prisma.profile.update({
      where: { userId: user.id },
      data: {
        cycleTrackingEnabled: enabled,
        cycleAvgLength: avgLength,
        cycleLastPeriodStart: lastPeriodStart ? fromISODate(lastPeriodStart) : null,
      },
    });
  }

  const estimate = estimateCyclePhase(
    { enabled, lastPeriodStart, avgLengthDays: avgLength },
    input.date,
  );
  return estimate?.phase ?? null;
}

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

  // La fase estimada solo rellena el hueco: si ella marcó una, esa manda. El
  // motor ya sabe qué hacer con ella (regla R1, semana no concluyente).
  const estimatedPhase = await syncCycle(user, formData, parsed.data);
  const input = {
    ...parsed.data,
    cyclePhase: parsed.data.cyclePhase ?? estimatedPhase,
  };

  const checkIn = await persistCheckIn(user.id, input);

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

    // Una vista puede tener varias fotos (p. ej. dos perfiles); el check-in
    // semanal reemplaza las de su propia vista para no acumular versiones.
    await prisma.photo.deleteMany({ where: { checkInId: checkIn.id, view } });
    await prisma.photo.create({ data: { checkInId: checkIn.id, view, storagePath: path } });
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
