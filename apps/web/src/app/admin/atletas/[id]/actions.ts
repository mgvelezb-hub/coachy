"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { parseEngineConfig } from "@/lib/engine-config";
import { prisma } from "@/lib/prisma";

export type ConfigState = {
  status: "idle" | "error" | "success";
  message: string | null;
  errors: string[];
};

export const EMPTY_CONFIG_STATE: ConfigState = { status: "idle", message: null, errors: [] };

/**
 * Guarda los overrides de config del motor para un atleta.
 *
 * TODO(fase-2): cuando `@coachy/engine` exporte `loadConfig`, validar con esa
 * función en lugar del schema local — así el admin no puede guardar una config
 * que el motor luego rechace.
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
    data: { engineConfig: parsed.config },
  });

  revalidatePath(`/admin/atletas/${userId}`);
  return { status: "success", message: "Config guardada.", errors: [] };
}
