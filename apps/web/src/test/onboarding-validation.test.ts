import { describe, expect, it } from "vitest";

import {
  coerceOnboardingPayload,
  initialPhase,
  onboardingSchema,
} from "@/lib/validation/onboarding";

function validOnboarding() {
  return {
    displayName: "Alex",
    sex: "FEMALE" as const,
    birthDate: "1998-04-12",
    heightCm: 162,
    weightKg: 75,
    leanMassKg: null,
    liftingDays: 4,
    cardioMinWk: 90,
    work: "SEDENTARIO" as const,
    trainingTime: "MANANA" as const,
    mealsPerDay: 4,
    budget: "MEDIO" as const,
    favoriteFoods: "pollo, avena",
    excludedFoods: "",
    allergies: "",
    conditions: [],
    goal: "RECOMPOSICION" as const,
    photoConsent: true,
  };
}

describe("onboardingSchema", () => {
  it("acepta un cuestionario completo", () => {
    expect(onboardingSchema.safeParse(validOnboarding()).success).toBe(true);
  });

  it("exige un nombre de al menos dos caracteres", () => {
    const result = onboardingSchema.safeParse({ ...validOnboarding(), displayName: "A" });
    expect(result.success).toBe(false);
  });

  it("rechaza una edad menor de 13 años", () => {
    const nextYear = new Date().getFullYear() - 5;
    const result = onboardingSchema.safeParse({
      ...validOnboarding(),
      birthDate: `${nextYear}-01-01`,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza estaturas y pesos fuera de rango", () => {
    expect(onboardingSchema.safeParse({ ...validOnboarding(), heightCm: 90 }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...validOnboarding(), weightKg: 500 }).success).toBe(false);
  });

  it("acota los días de pesas a 0-7", () => {
    expect(onboardingSchema.safeParse({ ...validOnboarding(), liftingDays: 0 }).success).toBe(true);
    expect(onboardingSchema.safeParse({ ...validOnboarding(), liftingDays: 8 }).success).toBe(false);
  });

  it("acota las comidas al día a 3-5, como la plantilla del motor", () => {
    expect(onboardingSchema.safeParse({ ...validOnboarding(), mealsPerDay: 2 }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...validOnboarding(), mealsPerDay: 6 }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...validOnboarding(), mealsPerDay: 5 }).success).toBe(true);
  });

  it("parte la lista de favoritos en un arreglo limpio y sin duplicados", () => {
    const result = onboardingSchema.parse({
      ...validOnboarding(),
      favoriteFoods: " Pollo , avena,  POLLO , ,camote",
    });
    expect(result.favoriteFoods).toEqual(["pollo", "avena", "camote"]);
  });

  it("rechaza una condición inventada", () => {
    const result = onboardingSchema.safeParse({
      ...validOnboarding(),
      conditions: ["signo_zodiacal"],
    });
    expect(result.success).toBe(false);
  });

  it("deja el consentimiento de fotos en falso si no se marca", () => {
    const { photoConsent: _drop, ...withoutConsent } = validOnboarding();
    const result = onboardingSchema.parse(withoutConsent);
    expect(result.photoConsent).toBe(false);
  });
});

describe("coerceOnboardingPayload", () => {
  it("convierte el FormData de strings a los tipos del schema", () => {
    const raw = {
      displayName: "Alex",
      sex: "FEMALE",
      birthDate: "1998-04-12",
      heightCm: "162",
      weightKg: "75.5",
      leanMassKg: "",
      liftingDays: "4",
      cardioMinWk: "",
      work: "",
      trainingTime: "",
      mealsPerDay: "4",
      budget: "",
      favoriteFoods: "pollo",
      excludedFoods: "",
      allergies: "",
      conditions: [],
      goal: "RECOMPOSICION",
      photoConsent: "on",
    };
    const result = onboardingSchema.safeParse(coerceOnboardingPayload(raw));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weightKg).toBe(75.5);
      expect(result.data.leanMassKg).toBeNull();
      expect(result.data.photoConsent).toBe(true);
      // Los selects vacíos caen a los defaults, no a undefined.
      expect(result.data.work).toBe("SEDENTARIO");
      expect(result.data.budget).toBe("MEDIO");
    }
  });

  it("lee el checkbox de consentimiento como 'on' del FormData", () => {
    const marked = coerceOnboardingPayload({ photoConsent: "on" }) as { photoConsent: boolean };
    const unmarked = coerceOnboardingPayload({}) as { photoConsent: boolean };
    expect(marked.photoConsent).toBe(true);
    expect(unmarked.photoConsent).toBe(false);
  });
});

describe("initialPhase", () => {
  it("arranca en BASE a quien ya entrena 3 días o más", () => {
    expect(initialPhase({ liftingDays: 3 })).toBe("BASE");
    expect(initialPhase({ liftingDays: 5 })).toBe("BASE");
  });

  it("arranca en REINTRO a quien viene de una pausa", () => {
    expect(initialPhase({ liftingDays: 0 })).toBe("REINTRO");
    expect(initialPhase({ liftingDays: 2 })).toBe("REINTRO");
  });
});
