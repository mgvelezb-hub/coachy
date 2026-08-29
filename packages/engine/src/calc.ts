import { DEFAULT_CONFIG, EngineConfigError, deficitRange, type EngineConfig } from './config.js';
import type { EnergyBase, LeanMassEstimate, MacroTargets, Phase, Profile } from './types.js';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function roundTo(value: number, step: number): number {
  if (step <= 0) return Math.round(value);
  return Math.round(value / step) * step;
}

/** BMR Mifflin-St Jeor (spec §2). */
export function bmrMifflin(profile: Profile): number {
  const sexTerm = profile.sex === 'female' ? -161 : 5;
  return 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.ageYears + sexTerm;
}

/** Nivel de actividad fisica, acotado por config (default 1.2-1.9). */
export function pal(profile: Profile, config: EngineConfig = DEFAULT_CONFIG): number {
  const c = config.pal;
  const raw =
    c.base +
    c.perStrengthDay * profile.strengthDaysPerWeek +
    c.perCardioMin * profile.cardioMinPerWeek +
    (profile.work === 'activo' ? c.activeWorkBonus : 0);
  return clamp(raw, c.min, c.max);
}

export function tdee(profile: Profile, config: EngineConfig = DEFAULT_CONFIG): number {
  return bmrMifflin(profile) * pal(profile, config);
}

/**
 * Masa libre de grasa.
 * 1. InBody si existe.
 * 2. US Navy con cintura medida (cuello y cadera estimados por estatura) -> `estimated: true`.
 * 3. Deurenberg por IMC cuando no hay cintura -> `estimated: true`.
 */
export function leanMass(profile: Profile, waistCm?: number): LeanMassEstimate {
  if (profile.leanMassKg && profile.leanMassKg > 0) {
    const bodyFatPct = ((profile.weightKg - profile.leanMassKg) / profile.weightKg) * 100;
    return { kg: profile.leanMassKg, estimated: false, bodyFatPct, method: 'inbody' };
  }

  if (waistCm && waistCm > 0) {
    // Cuello y cadera no se miden en el check-in: se estiman por estatura.
    const neck = profile.sex === 'female' ? 0.1975 * profile.heightCm : 0.2225 * profile.heightCm;
    const hip = profile.sex === 'female' ? waistCm * 1.12 : waistCm;
    const bodyFatPct =
      profile.sex === 'female'
        ? 495 /
            (1.29579 -
              0.35004 * Math.log10(waistCm + hip - neck) +
              0.221 * Math.log10(profile.heightCm)) -
          450
        : 495 /
            (1.0324 - 0.19077 * Math.log10(waistCm - neck) + 0.15456 * Math.log10(profile.heightCm)) -
          450;
    const safePct = clamp(bodyFatPct, 5, 60);
    return {
      kg: profile.weightKg * (1 - safePct / 100),
      estimated: true,
      bodyFatPct: safePct,
      method: 'us_navy',
    };
  }

  const bmi = profile.weightKg / (profile.heightCm / 100) ** 2;
  const sexFactor = profile.sex === 'female' ? 0 : 1;
  const bodyFatPct = clamp(1.2 * bmi + 0.23 * profile.ageYears - 10.8 * sexFactor - 5.4, 5, 60);
  return {
    kg: profile.weightKg * (1 - bodyFatPct / 100),
    estimated: true,
    bodyFatPct,
    method: 'deurenberg_bmi',
  };
}

export function energyBase(
  profile: Profile,
  config: EngineConfig = DEFAULT_CONFIG,
  waistCm?: number,
): EnergyBase {
  const bmr = bmrMifflin(profile);
  const palValue = pal(profile, config);
  return { bmr, pal: palValue, tdee: bmr * palValue, leanMass: leanMass(profile, waistCm) };
}

/** Piso absoluto de calorias: nunca por debajo de `kcalFloorFactorBmr` x BMR. */
export function kcalFloor(profile: Profile, config: EngineConfig = DEFAULT_CONFIG): number {
  return bmrMifflin(profile) * config.kcalFloorFactorBmr;
}

/** kcal objetivo para un deficit dado, respetando el piso. */
export function kcalForDeficit(
  profile: Profile,
  deficitPct: number,
  config: EngineConfig = DEFAULT_CONFIG,
): number {
  const target = tdee(profile, config) * (1 - deficitPct);
  return Math.max(target, kcalFloor(profile, config));
}

/** Deficit efectivo (vs TDEE) que representa un objetivo de kcal. */
export function deficitForKcal(
  profile: Profile,
  kcal: number,
  config: EngineConfig = DEFAULT_CONFIG,
): number {
  return 1 - kcal / tdee(profile, config);
}

/**
 * Macros de la fase (spec §2).
 * - proteina: clamp(2.3 x MLG, min x peso, max x peso) con piso duro de seguridad.
 * - grasa: max(g/kg configurado, % kcal configurado).
 * - carbos: el resto.
 * - fibra: >= 25 g (30 si glucosa alta).
 * Lanza si el deficit implicito cae fuera del rango configurado de la fase.
 */
export function macrosFor(
  phase: Phase,
  profile: Profile,
  kcal: number,
  config: EngineConfig = DEFAULT_CONFIG,
  options: { waistCm?: number; validateDeficit?: boolean } = {},
): MacroTargets {
  const floor = kcalFloor(profile, config);
  if (kcal < floor - 1e-6) {
    throw new EngineConfigError(
      `kcal ${Math.round(kcal)} por debajo del piso ${Math.round(floor)} (${config.kcalFloorFactorBmr} x BMR)`,
    );
  }

  if (options.validateDeficit) {
    const [min, max] = deficitRange(phase, config);
    const deficit = deficitForKcal(profile, kcal, config);
    const eps = 1e-6;
    if (deficit < min - eps || deficit > max + eps) {
      throw new EngineConfigError(
        `Deficit ${(deficit * 100).toFixed(1)}% fuera del rango configurado para ${phase} ` +
          `(${(min * 100).toFixed(1)}%-${(max * 100).toFixed(1)}%)`,
      );
    }
  }

  const mlg = leanMass(profile, options.waistCm).kg;
  const proteinRaw = clamp(
    config.proteinGPerKgLeanMass * mlg,
    config.proteinMinGPerKgBodyweight * profile.weightKg,
    config.proteinMaxGPerKgBodyweight * profile.weightKg,
  );
  const proteinSafetyFloor = config.proteinSafetyFloorGPerKgBodyweight * profile.weightKg;
  const proteinG = roundTo(Math.max(proteinRaw, proteinSafetyFloor), config.macroRoundingG);

  // Keto invierte el reparto: el carbohidrato se topa y las kcal que sobran se
  // van a grasa. La proteina NO se toca — es lo que sostiene el musculo, y
  // subirla "porque sobra" es el error clasico de las ketos caseras.
  const keto = profile.diet === 'keto';

  const fatRaw = keto
    ? Math.max(
        config.fatMinGPerKg * profile.weightKg,
        (kcal - proteinG * 4 - config.ketoCarbMaxG * 4) / 9,
      )
    : Math.max(config.fatMinGPerKg * profile.weightKg, (config.fatMinPctKcal * kcal) / 9);
  const fatG = roundTo(fatRaw, config.macroRoundingG);

  const carbKcal = kcal - proteinG * 4 - fatG * 9;
  const carbRaw = Math.max(0, carbKcal / 4);
  const carbG = roundTo(keto ? Math.min(carbRaw, config.ketoCarbMaxG) : carbRaw, config.macroRoundingG);

  const fiberBase = profile.conditions?.glucosaAlta ? config.fiberMinGHighGlucose : config.fiberMinG;
  const fiberG = Math.max(fiberBase, Math.round(carbG * 0.12));

  return {
    kcal: Math.round(proteinG * 4 + carbG * 4 + fatG * 9),
    proteinG,
    fatG,
    carbG,
    fiberG,
  };
}

/** Aplica el extra de carbos del refeed sobre unos macros ya calculados. */
export function withRefeedCarbs(
  targets: MacroTargets,
  config: EngineConfig = DEFAULT_CONFIG,
): MacroTargets {
  const carbG = targets.carbG + config.refeedExtraCarbG;
  return {
    ...targets,
    carbG,
    kcal: Math.round(targets.proteinG * 4 + carbG * 4 + targets.fatG * 9),
    fiberG: Math.max(targets.fiberG, Math.round(carbG * 0.12)),
  };
}
