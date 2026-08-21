/**
 * Interfaz mínima del motor de dietas, replicada aquí a propósito.
 *
 * TODO(fase-2): `packages/engine` se construye en paralelo. Cuando publique
 * `@coachy/engine` con `index.ts` y el nombre de paquete definitivo, sustituir
 * este archivo por `export type { ... } from "@coachy/engine"` y borrar el
 * fallback de `engine-config.ts`. Los nombres siguen la spec 02 para que el
 * cambio sea mecánico.
 */

export type Phase =
  | "REINTRO"
  | "BASE"
  | "CUT"
  | "CUT_AGRESIVO"
  | "REFEED"
  | "ESTABILIZACION"
  | "MANTENIMIENTO";

export type StrengthTrend = "sube" | "igual" | "baja";

export type CyclePhase = "folicular" | "ovulacion" | "lutea" | "menstruacion" | "na";

export interface EngineProfile {
  sex: "female" | "male" | "other";
  ageYears: number;
  heightCm: number;
  weightKg: number;
  leanMassKg?: number;
  liftingDaysPerWeek: number;
  cardioMinPerWeek: number;
  work: "sedentario" | "activo";
  mealsPerDay: number;
  trainingTime: "manana" | "mediodia" | "tarde" | "noche";
  budget: "bajo" | "medio" | "alto";
  favoriteFoods: string[];
  excludedFoods: string[];
  conditions: string[];
}

export interface EngineCheckIn {
  date: string;
  weightKg?: number | null;
  waistCm?: number | null;
  legLeftCm?: number | null;
  legRightCm?: number | null;
  armLeftCm?: number | null;
  armRightCm?: number | null;
  strengthRpe?: number | null;
  strengthTrend?: StrengthTrend | null;
  inflammation: number;
  energy: number;
  hunger: number;
  satiety: number;
  sleep: number;
  dietCompliancePct: number;
  trainingCompliancePct: number;
  symptoms: string[];
  cyclePhase?: CyclePhase | null;
  comment?: string | null;
}

export interface RuleHit {
  id: string;
  /** Explicación en español, lista para mostrarse al admin. */
  explanation: string;
}

export interface MacroTargets {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
}

export interface EngineDecision {
  phase: Phase;
  macros: MacroTargets;
  rulesFired: RuleHit[];
  explanation: string;
}
