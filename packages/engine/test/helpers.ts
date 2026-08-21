import type { CheckIn, Profile, Scale5 } from '../src/types.js';

/** Perfil de calibracion del plan: mujer 75 kg, 1.62 m, 28 anos, 4 dias de pesas, 105 min de cardio. */
export const CALIBRATION_PROFILE: Profile = {
  sex: 'female',
  ageYears: 28,
  heightCm: 162,
  weightKg: 75,
  strengthDaysPerWeek: 4,
  cardioMinPerWeek: 105,
  work: 'sedentario',
  mealsPerDay: 4,
  trainingTime: 'manana',
  budget: 'medio',
};

export function checkIn(date: string, overrides: Partial<CheckIn> = {}): CheckIn {
  return {
    date,
    strengthTrend: 'igual',
    inflammation: 2 as Scale5,
    energy: 4 as Scale5,
    hunger: 3 as Scale5,
    sleep: 4 as Scale5,
    dietCompliancePct: 95,
    symptoms: [],
    cyclePhase: 'na',
    ...overrides,
  };
}

export function ruleIds(rules: { id: string }[]): string[] {
  return rules.map((r) => r.id);
}

/** Desviacion porcentual absoluta. */
export function devPct(got: number, want: number): number {
  return Math.abs((got - want) / want) * 100;
}
