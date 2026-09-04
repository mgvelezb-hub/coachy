import { describe, expect, it } from "vitest";

import {
  PORCION_POR_GRUPO,
  kcalPor100,
  problemaDelAlimento,
  rolDe,
} from "@/lib/alimento-propio";

const YOGURT = {
  nombre: "Yogurt griego marca X",
  grupo: "proteina" as const,
  proteina: "10",
  carbo: "4",
  grasa: "0",
  fibra: "",
  unidad: "taza" as const,
  gramosPorUnidad: "240",
  minimo: "0.5",
  maximo: "2",
};

describe("kcalPor100", () => {
  it("usa 4/4/9 y redondea al entero", () => {
    expect(kcalPor100("10", "4", "0")).toBe(56);
    expect(kcalPor100("", "", "")).toBe(0);
  });
});

describe("rolDe", () => {
  it("la proteína se parte por grasa sin preguntarle a nadie", () => {
    expect(rolDe("proteina", 2)).toBe("proteina_magra");
    expect(rolDe("proteina", 12)).toBe("proteina_grasa");
  });

  it("los demás grupos van directo a su rol", () => {
    expect(rolDe("carbo", 0)).toBe("carbo_complejo");
    expect(rolDe("verdura", 0)).toBe("vegetal_libre");
  });
});

describe("problemaDelAlimento", () => {
  it("un alimento bien capturado no tiene problema", () => {
    expect(problemaDelAlimento(YOGURT)).toBeNull();
  });

  it("pide nombre", () => {
    expect(problemaDelAlimento({ ...YOGURT, nombre: "Y" })).toContain("nombre");
  });

  it("no deja que los macros sumen más de 100 g", () => {
    const imposible = { ...YOGURT, proteina: "40", carbo: "40", grasa: "40" };
    expect(problemaDelAlimento(imposible)).toContain("100 g");
  });

  it("pide al menos un macro: el agua no es un alimento del menú", () => {
    expect(problemaDelAlimento({ ...YOGURT, proteina: "0", carbo: "0", grasa: "0" })).not.toBeNull();
  });

  it("no deja la fibra por encima del carbohidrato", () => {
    expect(problemaDelAlimento({ ...YOGURT, carbo: "4", fibra: "9" })).toContain("fibra");
  });

  it("exige gramos por unidad y un mínimo que no pase del máximo", () => {
    expect(problemaDelAlimento({ ...YOGURT, gramosPorUnidad: "0" })).not.toBeNull();
    expect(problemaDelAlimento({ ...YOGURT, minimo: "3", maximo: "2" })).not.toBeNull();
  });
});

describe("PORCION_POR_GRUPO", () => {
  it("cada grupo trae una porción de casa que ya sirve", () => {
    for (const grupo of ["proteina", "carbo", "grasa", "fruta", "verdura"] as const) {
      const porcion = PORCION_POR_GRUPO[grupo];
      expect(porcion.gramosPorUnidad).toBeGreaterThan(0);
      expect(porcion.minimo).toBeLessThanOrEqual(porcion.maximo);
    }
  });
});
