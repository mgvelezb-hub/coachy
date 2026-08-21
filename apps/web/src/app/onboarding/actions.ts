"use server";

import type { OnboardingState } from "./state";
export type { OnboardingState };
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { PHOTO_CONSENT_VERSION } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { fromISODate } from "@/lib/format";
import {
  coerceOnboardingPayload,
  initialPhase,
  onboardingSchema,
} from "@/lib/validation/onboarding";

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

  const input = parsed.data;
  const now = new Date();

  const consentFields = input.photoConsent
    ? { photoConsentAt: now, photoConsentVersion: PHOTO_CONSENT_VERSION }
    : { photoConsentAt: null, photoConsentVersion: null };

  const data = {
    displayName: input.displayName,
    sex: input.sex,
    birthDate: fromISODate(input.birthDate),
    heightCm: input.heightCm.toFixed(1),
    weightKg: input.weightKg.toFixed(1),
    leanMassKg: input.leanMassKg ? input.leanMassKg.toFixed(1) : null,
    liftingDays: input.liftingDays,
    cardioMinWk: input.cardioMinWk,
    work: input.work,
    trainingTime: input.trainingTime,
    mealsPerDay: input.mealsPerDay,
    budget: input.budget,
    favoriteFoods: input.favoriteFoods,
    excludedFoods: input.excludedFoods,
    allergies: input.allergies,
    conditions: input.conditions,
    goal: input.goal,
    ...consentFields,
  };

  await prisma.profile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...data,
      currentPhase: initialPhase(input),
      onboardingCompletedAt: now,
    },
    update: { ...data, onboardingCompletedAt: now },
  });

  revalidatePath("/app", "layout");
  redirect("/app");
}
