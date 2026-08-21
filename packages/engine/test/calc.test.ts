import { describe, expect, it } from 'vitest';
import {
  bmrMifflin,
  deficitForKcal,
  kcalFloor,
  kcalForDeficit,
  leanMass,
  macrosFor,
  pal,
  tdee,
} from '../src/calc.js';
import { DEFAULT_CONFIG, EngineConfigError, loadConfig, pickDeficit } from '../src/config.js';
import { CALIBRATION_PROFILE, devPct } from './helpers.js';

const TOL = 3; // %

describe('caso de calibracion (plan 0.2)', () => {
  const profile = CALIBRATION_PROFILE;

  it('BMR ~ 1,460 kcal', () => {
    expect(devPct(bmrMifflin(profile), 1460)).toBeLessThanOrEqual(TOL);
  });

  it('TDEE ~ 2,190 kcal', () => {
    expect(devPct(tdee(profile), 2190)).toBeLessThanOrEqual(TOL);
  });

  it('PAL dentro del rango acotado', () => {
    const value = pal(profile);
    expect(value).toBeGreaterThanOrEqual(DEFAULT_CONFIG.pal.min);
    expect(value).toBeLessThanOrEqual(DEFAULT_CONFIG.pal.max);
  });

  it('proteina ~ 130 g y grasa ~ 40 g', () => {
    const kcal = kcalForDeficit(profile, pickDeficit('BASE', DEFAULT_CONFIG));
    const macros = macrosFor('BASE', profile, kcal);
    expect(devPct(macros.proteinG, 130)).toBeLessThanOrEqual(TOL);
    expect(devPct(macros.fatG, 40)).toBeLessThanOrEqual(TOL);
  });

  it('los macros cuadran con las kcal', () => {
    const kcal = kcalForDeficit(profile, pickDeficit('BASE', DEFAULT_CONFIG));
    const m = macrosFor('BASE', profile, kcal);
    expect(m.proteinG * 4 + m.carbG * 4 + m.fatG * 9).toBe(m.kcal);
  });
});

describe('PAL', () => {
  it('sube con trabajo activo y se acota en 1.9', () => {
    const beast = {
      ...CALIBRATION_PROFILE,
      strengthDaysPerWeek: 6,
      cardioMinPerWeek: 900,
      work: 'activo' as const,
    };
    expect(pal(beast)).toBe(DEFAULT_CONFIG.pal.max);
  });

  it('nunca baja de 1.2', () => {
    const still = { ...CALIBRATION_PROFILE, strengthDaysPerWeek: 0, cardioMinPerWeek: 0 };
    expect(pal(still)).toBe(DEFAULT_CONFIG.pal.min);
  });
});

describe('masa magra', () => {
  it('usa InBody cuando existe y no marca estimacion', () => {
    const withInbody = { ...CALIBRATION_PROFILE, leanMassKg: 56 };
    const result = leanMass(withInbody);
    expect(result.kg).toBe(56);
    expect(result.estimated).toBe(false);
    expect(result.method).toBe('inbody');
  });

  it('usa US Navy cuando hay cintura y marca estimacion', () => {
    const result = leanMass(CALIBRATION_PROFILE, 90);
    expect(result.estimated).toBe(true);
    expect(result.method).toBe('us_navy');
    expect(result.kg).toBeGreaterThan(30);
    expect(result.kg).toBeLessThan(CALIBRATION_PROFILE.weightKg);
  });

  it('cae a IMC cuando no hay cintura ni InBody', () => {
    expect(leanMass(CALIBRATION_PROFILE).method).toBe('deurenberg_bmi');
  });
});

describe('limites fisicos', () => {
  it('nunca por debajo de 0.85 x BMR', () => {
    const floor = kcalFloor(CALIBRATION_PROFILE);
    expect(floor).toBeCloseTo(bmrMifflin(CALIBRATION_PROFILE) * 0.85, 5);
    // Un deficit imposible se topa en el piso, no lo cruza.
    expect(kcalForDeficit(CALIBRATION_PROFILE, 0.9)).toBe(floor);
  });

  it('macrosFor lanza si le pasan kcal por debajo del piso', () => {
    const floor = kcalFloor(CALIBRATION_PROFILE);
    expect(() => macrosFor('CUT', CALIBRATION_PROFILE, floor - 50)).toThrow(EngineConfigError);
  });

  it('la proteina nunca baja de 1.6 g/kg, ni con config agresiva', () => {
    const config = loadConfig({
      proteinGPerKgLeanMass: 1.5,
      proteinMinGPerKgBodyweight: 1.6,
      proteinMaxGPerKgBodyweight: 1.7,
    });
    const kcal = kcalForDeficit(CALIBRATION_PROFILE, 0.3, config);
    const macros = macrosFor('CUT_AGRESIVO', CALIBRATION_PROFILE, kcal, config);
    expect(macros.proteinG).toBeGreaterThanOrEqual(1.6 * CALIBRATION_PROFILE.weightKg);
  });

  it('la grasa nunca baja del piso hormonal', () => {
    const kcal = kcalForDeficit(CALIBRATION_PROFILE, 0.38);
    const macros = macrosFor('CUT_AGRESIVO', CALIBRATION_PROFILE, kcal);
    expect(macros.fatG).toBeGreaterThanOrEqual(0.5 * CALIBRATION_PROFILE.weightKg);
  });

  it('la fibra sube a 30 g con glucosa alta', () => {
    const profile = { ...CALIBRATION_PROFILE, conditions: { glucosaAlta: true } };
    const kcal = kcalForDeficit(profile, 0.25);
    expect(macrosFor('CUT', profile, kcal).fiberG).toBeGreaterThanOrEqual(30);
  });
});

describe('deficit fuera de config', () => {
  it('lanza cuando se valida un deficit fuera del rango de la fase', () => {
    const kcal = kcalForDeficit(CALIBRATION_PROFILE, 0.35);
    expect(() =>
      macrosFor('BASE', CALIBRATION_PROFILE, kcal, DEFAULT_CONFIG, { validateDeficit: true }),
    ).toThrow(EngineConfigError);
  });

  it('no lanza cuando el deficit cae dentro del rango', () => {
    const kcal = kcalForDeficit(CALIBRATION_PROFILE, 0.22);
    expect(() =>
      macrosFor('BASE', CALIBRATION_PROFILE, kcal, DEFAULT_CONFIG, { validateDeficit: true }),
    ).not.toThrow();
  });

  it('deficitForKcal es el inverso de kcalForDeficit', () => {
    const kcal = kcalForDeficit(CALIBRATION_PROFILE, 0.24);
    expect(deficitForKcal(CALIBRATION_PROFILE, kcal)).toBeCloseTo(0.24, 6);
  });
});
