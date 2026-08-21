import { z } from 'zod';
import type { Phase } from './types.js';

/**
 * Configuracion del motor (spec 02 §7). Todo editable sin tocar codigo.
 * Los defaults estan calibrados contra el historial del coach real; las
 * desviaciones respecto al texto literal del spec estan documentadas en
 * `BACKTEST.md` y en el `README.md`.
 */

const range01 = z
  .tuple([z.number().min(0).max(0.6), z.number().min(0).max(0.6)])
  .refine(([min, max]) => min <= max, { message: 'rango de deficit invertido: min > max' });

const phaseKey = z.enum([
  'REINTRO',
  'BASE',
  'CUT',
  'CUT_AGRESIVO',
  'REFEED',
  'ESTABILIZACION',
  'MANTENIMIENTO',
]);

export const ConfigSchema = z
  .object({
    /** Rango [min,max] de deficit vs TDEE por fase. */
    deficits: z.record(phaseKey, range01),
    /** Tope de semanas por fase antes de forzar la transicion. */
    maxWeeks: z.record(phaseKey, z.number().int().min(1).max(999)),
    /** Donde cae el deficit dentro del rango al entrar a una fase. */
    deficitPick: z.enum(['min', 'mid', 'max']),

    /** Coeficientes del PAL (spec §2, calibrados: ver README). */
    pal: z.object({
      base: z.number().min(1).max(1.5),
      perStrengthDay: z.number().min(0).max(0.2),
      perCardioMin: z.number().min(0).max(0.01),
      activeWorkBonus: z.number().min(0).max(0.3),
      min: z.number().min(1).max(2),
      max: z.number().min(1).max(2.5),
    }),

    /** Macros. */
    proteinGPerKgLeanMass: z.number().min(1.5).max(3.5),
    /** Piso de proteina por kg de peso usado en el clamp (calibrado). */
    proteinMinGPerKgBodyweight: z.number().min(1.6).max(2.2),
    proteinMaxGPerKgBodyweight: z.number().min(1.6).max(3),
    /** Invariante duro de seguridad: la proteina nunca baja de aqui. */
    proteinSafetyFloorGPerKgBodyweight: z.number().min(1.2).max(2),
    fatMinGPerKg: z.number().min(0.4).max(1.5),
    fatMinPctKcal: z.number().min(0.1).max(0.4),
    fiberMinG: z.number().min(10).max(60),
    fiberMinGHighGlucose: z.number().min(10).max(60),
    kcalFloorFactorBmr: z.number().min(0.7).max(1),
    /** Redondeo de gramos de macro objetivo. */
    macroRoundingG: z.number().int().min(1).max(10),

    /** Ajuste semanal. */
    kcalAdjustStep: z.number().int().min(50).max(300),
    refeedExtraCarbG: z.number().int().min(25).max(200),
    waistProgressThresholdCmPerWeek: z.number().max(0),
    weightProgressThresholdPctPerWeek: z.number().max(0),
    weeksForStall: z.number().int().min(1).max(6),
    minComplianceToTighten: z.number().min(0).max(1),
    maxLossRatePctPerWeek: z.number().min(0.2).max(3),
    kcalRaiseStepOnFastLoss: z.number().int().min(50).max(300),

    /** Umbrales de senales. */
    inconclusiveWaistDeltaCm: z.number(),
    inflammationTightenThreshold: z.number().int().min(1).max(5),
    energyLowThreshold: z.number().int().min(1).max(5),
    hungerHighThreshold: z.number().int().min(1).max(5),
    sleepLowThreshold: z.number().int().min(1).max(5),
    /** Cuantos sintomas de adaptacion hacen falta para preferir REFEED sobre profundizar. */
    symptomCountForRefeed: z.number().int().min(1).max(4),
    /** Semanas seguidas con fuerza a la baja + hambre alta que disparan REFEED. */
    weeksStrengthDownForRefeed: z.number().int().min(1).max(4),
    /** Semanas con calambres/mareo en deficit profundo antes de forzar REFEED. */
    weeksElectrolyteSymptomsForRefeed: z.number().int().min(1).max(4),
    /** Dias sin entrenar que mandan a MANTENIMIENTO. */
    daysWithoutTrainingForMaintenance: z.number().int().min(5).max(30),
    /** Permitir usar sensaciones (desinflamacion + fuerza) como progreso cuando no hay medida objetiva. */
    allowSubjectiveProgress: z.boolean(),

    /** Menus. */
    menuRefreshWeeks: z.number().int().min(1).max(8),
    lowGiMax: z.number().int().min(30).max(80),
    freeVegetableGramsPerMeal: z.number().int().min(0).max(600),
    menuGramRoundingG: z.number().int().min(1).max(25),
    equivalencesPerItem: z.number().int().min(1).max(5),
  })
  .strict();

export type EngineConfig = z.infer<typeof ConfigSchema>;
export type ConfigOverrides = DeepPartial<EngineConfig>;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K];
};

export const DEFAULT_CONFIG: EngineConfig = {
  deficits: {
    REINTRO: [0.1, 0.15],
    BASE: [0.2, 0.25],
    // Calibrado: el spec dice [0.25,0.30]; se estrecha a 0.28 para que el
    // escalon de -100 kcal desde CUT caiga fuera de la banda y active el
    // protocolo CUT_AGRESIVO (con electrolitos y tope duro). Ver BACKTEST.md.
    CUT: [0.25, 0.28],
    CUT_AGRESIVO: [0.3, 0.38],
    REFEED: [0.2, 0.25],
    ESTABILIZACION: [0.2, 0.25],
    MANTENIMIENTO: [0, 0.1],
  },
  maxWeeks: {
    REINTRO: 2,
    BASE: 99,
    CUT: 6,
    // Spec: "max 2-3 sem". Calibrado a 2 (es lo que uso el coach real).
    CUT_AGRESIVO: 2,
    REFEED: 1,
    // Spec: "1-2 sem". Calibrado a 1.
    ESTABILIZACION: 1,
    MANTENIMIENTO: 999,
  },
  deficitPick: 'min',

  pal: {
    // Calibrado: con los coeficientes literales del spec (0.075 / 0.0015) el
    // caso de calibracion da TDEE 2,420 y el objetivo del plan es ~2,190.
    base: 1.2,
    perStrengthDay: 0.06,
    perCardioMin: 0.0006,
    activeWorkBonus: 0.1,
    min: 1.2,
    max: 1.9,
  },

  proteinGPerKgLeanMass: 2.3,
  // Calibrado: el coach real prescribia ~130 g a 75 kg = 1.73 g/kg.
  proteinMinGPerKgBodyweight: 1.73,
  proteinMaxGPerKgBodyweight: 2.2,
  proteinSafetyFloorGPerKgBodyweight: 1.6,
  // Calibrado: 40 g a 75 kg = 0.53 g/kg (>= el piso hormonal de 0.5 del spec).
  fatMinGPerKg: 0.53,
  fatMinPctKcal: 0.2,
  fiberMinG: 25,
  fiberMinGHighGlucose: 30,
  kcalFloorFactorBmr: 0.85,
  macroRoundingG: 5,

  // Spec: "-100 a -150 kcal". Calibrado al extremo suave.
  kcalAdjustStep: 100,
  refeedExtraCarbG: 75,
  waistProgressThresholdCmPerWeek: -0.5,
  weightProgressThresholdPctPerWeek: -0.5,
  weeksForStall: 2,
  minComplianceToTighten: 0.7,
  maxLossRatePctPerWeek: 1,
  kcalRaiseStepOnFastLoss: 100,

  inconclusiveWaistDeltaCm: -0.3,
  inflammationTightenThreshold: 4,
  energyLowThreshold: 2,
  hungerHighThreshold: 4,
  sleepLowThreshold: 2,
  symptomCountForRefeed: 2,
  weeksStrengthDownForRefeed: 2,
  weeksElectrolyteSymptomsForRefeed: 2,
  // Spec: ">= 7 dias". Calibrado a 10: una semana suelta no manda a mantenimiento.
  daysWithoutTrainingForMaintenance: 10,
  allowSubjectiveProgress: true,

  menuRefreshWeeks: 2,
  lowGiMax: 55,
  freeVegetableGramsPerMeal: 200,
  menuGramRoundingG: 5,
  equivalencesPerItem: 3,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(override)) return base;
  if (!isPlainObject(base)) return override as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(value) ? deepMerge((base as Record<string, unknown>)[key], value) : value;
  }
  return out as T;
}

/** Valida y devuelve la config efectiva. Lanza `ZodError` si algo esta fuera de rango. */
export function loadConfig(overrides?: ConfigOverrides): EngineConfig {
  const merged = deepMerge(DEFAULT_CONFIG, overrides);
  return ConfigSchema.parse(merged);
}

export class EngineConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineConfigError';
  }
}

/** Rango de deficit configurado para una fase. */
export function deficitRange(phase: Phase, config: EngineConfig): [number, number] {
  const range = config.deficits[phase];
  if (!range) throw new EngineConfigError(`No hay deficit configurado para la fase ${phase}`);
  return range;
}

/** Deficit objetivo al entrar a una fase, segun `deficitPick`. */
export function pickDeficit(phase: Phase, config: EngineConfig, pick = config.deficitPick): number {
  const [min, max] = deficitRange(phase, config);
  if (pick === 'min') return min;
  if (pick === 'max') return max;
  return (min + max) / 2;
}

/**
 * Valida que un deficit este dentro del rango configurado de la fase.
 * Deficits fuera de config son error, nunca warning (guardrail del plan).
 */
export function assertDeficitInRange(phase: Phase, deficitPct: number, config: EngineConfig): void {
  const [min, max] = deficitRange(phase, config);
  const eps = 1e-6;
  if (deficitPct < min - eps || deficitPct > max + eps) {
    throw new EngineConfigError(
      `Deficit ${(deficitPct * 100).toFixed(1)}% fuera del rango configurado para ${phase} ` +
        `(${(min * 100).toFixed(1)}%-${(max * 100).toFixed(1)}%)`,
    );
  }
}
