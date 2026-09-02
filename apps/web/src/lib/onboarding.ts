import "server-only";

import { Prisma, type Profile } from "@prisma/client";

import { DEFAULT_CYCLE_LENGTH, parseCycleSettings } from "@/lib/cycle";
import { PHOTO_CONSENT_VERSION } from "@/lib/env";
import { fromISODate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { deriveFromSchedule, initialPhase, type OnboardingInput } from "@/lib/validation/onboarding";

/**
 * Guardado del cuestionario de onboarding, ya validado contra
 * `onboardingSchema`.
 *
 * Punto ÚNICO de escritura del Profile inicial: tanto la Server Action de la
 * web (`app/onboarding/actions.ts`) como `POST /api/v1/onboarding` (la app
 * nativa, que no puede abrir el formulario web) llaman EXACTAMENTE esta
 * función. Antes de esto la lógica —fase inicial, defaults del ciclo,
 * consentimiento de fotos, upsert— vivía solo dentro de la Server Action;
 * duplicarla para la API hubiera significado dos lugares donde una regla de
 * negocio se pudiera actualizar en uno y olvidar en el otro (por ejemplo
 * `initialPhase`, o qué pasa con `photoConsentVersion` cuando se retira el
 * consentimiento). Con un solo punto de escritura eso no puede pasar.
 *
 * `raw` es el `Record<string, unknown>` de entrada (FormData ya convertido a
 * objeto en la web, o el JSON body en la API) del que se extrae el bloque
 * OPCIONAL del ciclo menstrual (`parseCycleSettings`): ese bloque no vive en
 * `onboardingSchema` porque un dato de calendario mal escrito no debe poder
 * tumbar el cuestionario entero (ver el docblock de `parseCycleSettings`).
 */
export async function saveOnboarding(
  userId: string,
  input: OnboardingInput,
  raw: Record<string, unknown>,
): Promise<Profile> {
  const now = new Date();
  const derived = deriveFromSchedule(input);

  const consentFields = input.photoConsent
    ? { photoConsentAt: now, photoConsentVersion: PHOTO_CONSENT_VERSION }
    : { photoConsentAt: null, photoConsentVersion: null };

  /**
   * Ciclo menstrual (Fase 7): opt-in explícito, y opcional de verdad. Se valida
   * aparte del cuestionario porque una fecha mal escrita aquí no debe impedir
   * terminar el onboarding — simplemente no se guarda el bloque.
   */
  const cycle = parseCycleSettings(raw);
  const cycleFields =
    cycle && cycle.cycleTrackingEnabled
      ? {
          cycleTrackingEnabled: true,
          cycleLastPeriodStart: cycle.cycleLastPeriodStart
            ? fromISODate(cycle.cycleLastPeriodStart)
            : null,
          cycleAvgLength: cycle.cycleAvgLength,
        }
      : {
          cycleTrackingEnabled: false,
          cycleLastPeriodStart: null,
          cycleAvgLength: DEFAULT_CYCLE_LENGTH,
        };

  const data = {
    displayName: input.displayName,
    sex: input.sex,
    birthDate: fromISODate(input.birthDate),
    heightCm: input.heightCm.toFixed(1),
    weightKg: input.weightKg.toFixed(1),
    leanMassKg: input.leanMassKg ? input.leanMassKg.toFixed(1) : null,
    liftingDays: derived.liftingDays,
    cardioMinWk: input.cardioMinWk,
    sessionMinutes: input.sessionMinutes,
    work: input.work,
    trainingTime: derived.trainingTime,
    trainingSchedule: input.trainingSchedule ?? Prisma.JsonNull,
    mealsPerDay: input.mealsPerDay,
    budget: input.budget,
    favoriteFoods: input.favoriteFoods,
    excludedFoods: input.excludedFoods,
    allergies: input.allergies,
    conditions: input.conditions,
    goal: input.goal,
    ...consentFields,
    ...cycleFields,
  };

  return prisma.profile.upsert({
    where: { userId },
    create: {
      userId,
      ...data,
      currentPhase: initialPhase({ liftingDays: derived.liftingDays }),
      onboardingCompletedAt: now,
    },
    update: { ...data, onboardingCompletedAt: now },
  });
}
