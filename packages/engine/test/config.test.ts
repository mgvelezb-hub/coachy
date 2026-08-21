import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  EngineConfigError,
  assertDeficitInRange,
  deficitRange,
  loadConfig,
  pickDeficit,
} from '../src/config.js';

describe('loadConfig', () => {
  it('devuelve los defaults sin overrides', () => {
    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('hace merge profundo sin perder el resto de la config', () => {
    const config = loadConfig({ pal: { perStrengthDay: 0.07 } });
    expect(config.pal.perStrengthDay).toBe(0.07);
    expect(config.pal.base).toBe(DEFAULT_CONFIG.pal.base);
    expect(config.kcalAdjustStep).toBe(DEFAULT_CONFIG.kcalAdjustStep);
  });

  it('rechaza un rango de deficit invertido', () => {
    expect(() => loadConfig({ deficits: { BASE: [0.3, 0.1] } })).toThrow();
  });

  it('rechaza una proteina por debajo del minimo permitido', () => {
    expect(() => loadConfig({ proteinGPerKgLeanMass: 0.5 })).toThrow();
  });

  it('rechaza claves desconocidas', () => {
    expect(() => loadConfig({ inventado: true } as never)).toThrow();
  });

  it('rechaza un piso de kcal absurdo', () => {
    expect(() => loadConfig({ kcalFloorFactorBmr: 0.2 })).toThrow();
  });
});

describe('deficits por fase', () => {
  it('pickDeficit respeta min / mid / max', () => {
    const [min, max] = deficitRange('CUT', DEFAULT_CONFIG);
    expect(pickDeficit('CUT', DEFAULT_CONFIG, 'min')).toBe(min);
    expect(pickDeficit('CUT', DEFAULT_CONFIG, 'max')).toBe(max);
    expect(pickDeficit('CUT', DEFAULT_CONFIG, 'mid')).toBeCloseTo((min + max) / 2, 6);
  });

  it('assertDeficitInRange lanza fuera del rango y calla dentro', () => {
    expect(() => assertDeficitInRange('BASE', 0.22, DEFAULT_CONFIG)).not.toThrow();
    expect(() => assertDeficitInRange('BASE', 0.4, DEFAULT_CONFIG)).toThrow(EngineConfigError);
    expect(() => assertDeficitInRange('BASE', 0.05, DEFAULT_CONFIG)).toThrow(EngineConfigError);
  });
});
