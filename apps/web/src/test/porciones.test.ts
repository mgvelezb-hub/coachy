import { describe, expect, it } from "vitest";

import { porcionNatural } from "@/lib/coachy/porciones";

/**
 * Gramos a piezas.
 *
 * El reporte que originó esto: "Tortilla de maíz — 90 g" obliga a dividir
 * mentalmente para saber cuántas tortillas son, y nadie pesa una tortilla.
 */

describe("porciones naturales", () => {
  it("convierte gramos a piezas en lo que se compra por pieza", () => {
    expect(porcionNatural("Tortilla de maiz", 90)).toBe("3 tortillas de maiz");
  });

  it("respeta el singular", () => {
    expect(porcionNatural("Huevo entero", 55)).toBe("1 huevo entero");
  });

  it("usa media pieza en vez de decimales", () => {
    // 82.5 g de tortilla son 2.75 piezas: se dice 3, no "2.75".
    expect(porcionNatural("Tortilla de maiz", 82.5)).toBe("3 tortillas de maiz");
    // 45 g son 1.5 piezas exactas.
    expect(porcionNatural("Tortilla de maiz", 45)).toBe("1½ tortillas de maiz");
  });

  it("deja en gramos lo que se pesa", () => {
    expect(porcionNatural("Pechuga de pollo", 150)).toBeNull();
    expect(porcionNatural("Arroz integral", 80)).toBeNull();
  });

  it("no inventa porciones de un alimento que no está en el catálogo", () => {
    expect(porcionNatural("Lo que sea", 100)).toBeNull();
  });

  it("pluraliza el sustantivo, no la frase", () => {
    expect(porcionNatural("Tortilla de maiz", 60)).toContain("tortillas de maiz");
    expect(porcionNatural("Huevo entero", 110)).toBe("2 huevos entero");
  });

  it("cero gramos no es media pieza", () => {
    expect(porcionNatural("Huevo entero", 0)).toBeNull();
  });
});
