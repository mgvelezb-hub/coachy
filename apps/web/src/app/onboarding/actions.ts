"use server";

import type { OnboardingState } from "./state";
export type { OnboardingState };
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { saveOnboarding } from "@/lib/onboarding";
import { coerceOnboardingPayload, onboardingSchema } from "@/lib/validation/onboarding";

/** Guarda el cuestionario inicial y crea (o actualiza) el Profile del atleta. */
export async function submitOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await requireUser();

  const raw = {
    ...Object.fromEntries(formData.entries()),
    conditions: formData.getAll("conditions"),
  };

  const parsed = onboardingSchema.safeParse(coerceOnboardingPayload(raw));

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Revisa los campos marcados.", fieldErrors };
  }

  // El guardado en sí —fase inicial, defaults del ciclo, consentimiento de
  // fotos, upsert— vive en `saveOnboarding` (`@/lib/onboarding`): es el mismo
  // punto de escritura que usa `POST /api/v1/onboarding` para la app nativa.
  // Ver el docblock de esa función para el porqué.
  await saveOnboarding(user.id, parsed.data, raw);

  revalidatePath("/app", "layout");
  redirect("/app");
}
