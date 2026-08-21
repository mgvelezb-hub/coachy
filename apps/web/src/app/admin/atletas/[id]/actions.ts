"use server";

import type { ConfigState } from "./state";
export type { ConfigState };
import { revalidatePath } from "next/cache";

import type { Prisma } from "@prisma/client";

import { requireAdmin } from "@/lib/auth";
import { parseEngineConfig } from "@/lib/engine-config";
import { prisma } from "@/lib/prisma";

/**
 * Guarda los overrides de config del motor para un atleta.
 *
 * Se valida con el `loadConfig` real del motor: lo que se guarda es lo que el
 * motor va a aceptar después, no una copia del esquema que puede desfasarse.
 * En la base quedan los overrides, no la config resuelta, para que el atleta
 * herede cualquier cambio futuro en los defaults del motor.
 */
export async function saveEngineConfig(
  _prev: ConfigState,
  formData: FormData,
): Promise<ConfigState> {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const text = String(formData.get("config") ?? "").trim();

  if (!userId) {
    return { status: "error", message: "Falta el atleta.", errors: [] };
  }

  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) {
    return { status: "error", message: "Ese atleta todavía no terminó su onboarding.", errors: [] };
  }

  // Vacío = volver a los defaults del motor.
  if (text === "") {
    await prisma.profile.update({ where: { userId }, data: { engineConfig: undefined } });
    revalidatePath(`/admin/atletas/${userId}`);
    return { status: "success", message: "Config borrada: vuelve a los valores por defecto.", errors: [] };
  }

  const parsed = parseEngineConfig(text);
  if (!parsed.ok) {
    return { status: "error", message: "La config no es válida.", errors: parsed.errors };
  }

  await prisma.profile.update({
    where: { userId },
    data: { engineConfig: parsed.overrides as Prisma.InputJsonValue },
  });

  revalidatePath(`/admin/atletas/${userId}`);
  return { status: "success", message: "Config guardada.", errors: [] };
}
