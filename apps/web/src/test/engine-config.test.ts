import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG, parseEngineConfig } from "@/lib/engine-config";

/**
 * El editor del admin valida con el `loadConfig` real del motor. Estas pruebas
 * cuidan la costura: que los overrides se mezclen, que lo inválido se rechace
 * y que el error salga legible en lugar de reventar.
 */
describe("parseEngineConfig", () => {
  it("acepta un override parcial y lo mezcla con los defaults", () => {
    const result = parseEngineConfig('{ "kcalAdjustStep": 150 }');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.overrides).toEqual({ kcalAdjustStep: 150 });
      expect(result.resolved.kcalAdjustStep).toBe(150);
      // Lo que no se tocó sigue viniendo del motor.
      expect(result.resolved.weeksForStall).toBe(DEFAULT_ENGINE_CONFIG.weeksForStall);
    }
  });

  it("acepta un objeto vacío: son todos los defaults", () => {
    const result = parseEngineConfig("{}");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resolved).toEqual(DEFAULT_ENGINE_CONFIG);
  });

  it("rechaza un valor fuera del rango que el motor considera seguro", () => {
    const result = parseEngineConfig('{ "kcalFloorFactorBmr": 0.2 }');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rechaza un tipo equivocado", () => {
    const result = parseEngineConfig('{ "weeksForStall": "dos" }');
    expect(result.ok).toBe(false);
  });

  it("rechaza una llave que el motor no conoce, en vez de ignorarla", () => {
    const result = parseEngineConfig('{ "kcalAjusteStep": 150 }');
    expect(result.ok).toBe(false);
  });

  it("devuelve un mensaje legible cuando el JSON está roto", () => {
    const result = parseEngineConfig("{ esto no es json }");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("JSON inválido");
  });

  it("rechaza un arreglo o un escalar en la raíz", () => {
    expect(parseEngineConfig("[1, 2]").ok).toBe(false);
    expect(parseEngineConfig("42").ok).toBe(false);
    expect(parseEngineConfig("null").ok).toBe(false);
  });
});
