import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, pal } from "engine";

import { engineConfigForActivity } from "@/lib/coachy/mapping";
import {
  MIN_DAYS_FOR_PAL,
  bandForSteps,
  palAdjustment,
  readinessNote,
  summarizeActivity,
  type HealthDayInput,
} from "@/lib/health/activity";
import type { EngineProfile } from "@/lib/engine-types";

/**
 * PAL dinámico y readiness (Fase 8).
 *
 * Lo que se prueba es la frontera: sin datos, el motor corre exactamente como
 * antes; con datos, la corrección es chica, acotada y explicable.
 */

function days(count: number, steps: number, sleepMin: number | null = null): HealthDayInput[] {
  return Array.from({ length: count }, (_, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    steps,
    sleepMin,
  }));
}

const PROFILE: EngineProfile = {
  sex: "female",
  ageYears: 30,
  heightCm: 162,
  weightKg: 72,
  strengthDaysPerWeek: 4,
  cardioMinPerWeek: 90,
  work: "sedentario",
  mealsPerDay: 4,
  trainingTime: "manana",
  budget: "medio",
  favoriteFoods: [],
  excludedFoods: [],
  conditions: {},
};

describe("bandas de actividad", () => {
  it("parte los pasos en cuatro bandas", () => {
    expect(bandForSteps(3_200)).toBe("sedentario");
    expect(bandForSteps(6_400)).toBe("ligero");
    expect(bandForSteps(9_800)).toBe("activo");
    expect(bandForSteps(13_500)).toBe("muy_activo");
  });

  it("un día sin pasos no cuenta como cero", () => {
    const window = summarizeActivity([
      { date: "2026-08-01", steps: 10_000, sleepMin: null },
      { date: "2026-08-02", steps: null, sleepMin: 400 },
    ]);

    expect(window?.days).toBe(1);
    expect(window?.avgSteps).toBe(10_000);
    expect(window?.avgSleepMin).toBe(400);
  });
});

describe("PAL dinámico", () => {
  it("no toca nada con menos de dos semanas de pasos", () => {
    const window = summarizeActivity(days(MIN_DAYS_FOR_PAL - 1, 13_000));
    expect(palAdjustment(window, DEFAULT_CONFIG.pal.base)).toBeNull();
    expect(engineConfigForActivity(window)).toBeNull();
  });

  it("no toca nada sin datos del reloj", () => {
    expect(engineConfigForActivity(null)).toBeNull();
    expect(summarizeActivity([])).toBeNull();
  });

  it("la banda ligera deja el motor con sus defaults", () => {
    const window = summarizeActivity(days(20, 6_000));
    expect(palAdjustment(window, DEFAULT_CONFIG.pal.base)).toBeNull();
  });

  it("sube el PAL de quien camina mucho y lo baja de quien no", () => {
    const activa = engineConfigForActivity(summarizeActivity(days(20, 13_000)));
    const quieta = engineConfigForActivity(summarizeActivity(days(20, 3_000)));

    expect(activa?.adjustment.delta).toBe(0.1);
    expect(quieta?.adjustment.delta).toBe(-0.05);

    const base = pal(PROFILE, DEFAULT_CONFIG);
    expect(pal(PROFILE, activa?.config ?? DEFAULT_CONFIG)).toBeCloseTo(base + 0.1, 5);
    expect(pal(PROFILE, quieta?.config ?? DEFAULT_CONFIG)).toBeCloseTo(base - 0.05, 5);
  });

  it("el motor sigue acotando el PAL a su rango", () => {
    const activa = engineConfigForActivity(summarizeActivity(days(20, 20_000)));
    const config = activa?.config ?? DEFAULT_CONFIG;

    const maratonista: EngineProfile = {
      ...PROFILE,
      strengthDaysPerWeek: 6,
      cardioMinPerWeek: 600,
      work: "activo",
    };
    const sofa: EngineProfile = { ...PROFILE, strengthDaysPerWeek: 0, cardioMinPerWeek: 0 };

    expect(pal(maratonista, config)).toBeLessThanOrEqual(config.pal.max);
    expect(pal(sofa, config)).toBeGreaterThanOrEqual(config.pal.min);
  });

  it("el base ajustado sigue siendo válido para el motor", () => {
    // `loadConfig` lanza si el base sale de 1.0-1.5: que no lance es la prueba.
    expect(() => engineConfigForActivity(summarizeActivity(days(30, 25_000)))).not.toThrow();
    expect(() => engineConfigForActivity(summarizeActivity(days(30, 100)))).not.toThrow();
  });
});

describe("readiness", () => {
  it("avisa cuando durmió menos de seis horas, sin cambiar cargas", () => {
    const note = readinessNote(4 * 60 + 40);
    expect(note).toContain("4 h 40 min");
    expect(note).toContain("bajar un escalón");
  });

  it("calla si durmió bien o si no hay dato", () => {
    expect(readinessNote(7 * 60)).toBeNull();
    expect(readinessNote(6 * 60)).toBeNull();
    expect(readinessNote(null)).toBeNull();
    expect(readinessNote(0)).toBeNull();
  });
});
