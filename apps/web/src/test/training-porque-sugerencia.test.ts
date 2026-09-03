import { describe, expect, it } from "vitest";

import { porqueDeLaSugerencia } from "@/lib/training/manual";

describe("el porqué de la sugerencia", () => {
  it("siempre dice el objetivo, aunque no haya nada más que decir", () => {
    const texto = porqueDeLaSugerencia("PIERNA_CUADRICEPS", {
      goal: "GANANCIA_MUSCULO",
      conditions: [],
      volumeBias: "normal",
      zonasLejos: [],
    });
    expect(texto).toBe("Para ganar músculo.");
  });

  it("nombra la lesión y el volumen recortado de la fase", () => {
    const texto = porqueDeLaSugerencia("PIERNA_CUADRICEPS", {
      goal: "PERDIDA_GRASA",
      conditions: ["lesion_rodilla"],
      volumeBias: "reducido",
      zonasLejos: [],
    });
    expect(texto).toContain("zona lesionada");
    expect(texto).toContain("volumen recortado");
  });

  it("solo menciona las zonas lejos que este día toca", () => {
    const enPierna = porqueDeLaSugerencia("PIERNA_CUADRICEPS", {
      goal: "RECOMPOSICION",
      conditions: [],
      volumeBias: "normal",
      zonasLejos: ["PIERNA", "ESPALDA"],
    });
    expect(enPierna).toContain("pierna");
    expect(enPierna).not.toContain("espalda");

    const enBrazo = porqueDeLaSugerencia("BRAZO", {
      goal: "RECOMPOSICION",
      conditions: [],
      volumeBias: "normal",
      zonasLejos: ["PIERNA"],
    });
    expect(enBrazo).toBe("Para recomponer.");
  });
});
