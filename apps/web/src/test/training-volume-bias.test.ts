import { describe, expect, it } from "vitest";

import { volumeBiasForPhase } from "@/lib/training/db";

/**
 * `volumeBiasForPhase` es la única frontera entre el motor de nutrición
 * (`Phase`) y el generador de rutinas (`VolumeBias`). Prueba pura: no toca
 * Postgres, solo la traducción.
 */
describe("volumeBiasForPhase", () => {
  it("CUT_AGRESIVO reduce el volumen", () => {
    expect(volumeBiasForPhase("CUT_AGRESIVO")).toBe("reducido");
  });

  it("cualquier otra fase deja el volumen normal", () => {
    const otras = [
      "REINTRO",
      "BASE",
      "CUT",
      "REFEED",
      "ESTABILIZACION",
      "MANTENIMIENTO",
    ] as const;

    for (const phase of otras) {
      expect(volumeBiasForPhase(phase)).toBe("normal");
    }
  });
});
