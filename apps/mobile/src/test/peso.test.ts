import { describe, expect, it } from "vitest";

import { aKilos, aUnidad, ajustaPeso, formatoPeso, pasosDe } from "@/lib/peso";

describe("peso", () => {
  it("convierte de ida y vuelta sin perder el valor", () => {
    expect(aUnidad(100, "kg")).toBe(100);
    expect(aUnidad(100, "lb")).toBeCloseTo(220.46, 1);
    expect(aKilos(220.46, "lb")).toBeCloseTo(100, 1);
  });

  it("suma en la unidad que se está viendo, no en kilos", () => {
    // Quien sube de 135 lb de 5 en 5 quiere 140 exactas, no 139.99.
    const kilos = aKilos(135, "lb");
    expect(aUnidad(ajustaPeso(kilos, 5, "lb"), "lb")).toBeCloseTo(140, 4);
  });

  it("cuadra al múltiplo del paso", () => {
    // Quien viene de 63 kg y sube de 2.5 en 2.5 espera 65, no 65.5.
    expect(ajustaPeso(63, 2.5, "kg")).toBe(65);
    expect(ajustaPeso(60, 0.5, "kg")).toBe(60.5);
  });

  it("nunca baja de cero", () => {
    expect(ajustaPeso(1, -2.5, "kg")).toBe(0);
    expect(ajustaPeso(null, -5, "kg")).toBe(0);
  });

  it("escribe el número como se dice", () => {
    expect(formatoPeso(60)).toBe("60");
    expect(formatoPeso(62.5)).toBe("62.5");
    expect(formatoPeso(137.78901)).toBe("137.8");
  });

  it("cada unidad ofrece los saltos que existen en el gimnasio", () => {
    expect(pasosDe("kg")).toContain(0.5);
    expect(pasosDe("lb")).toContain(5);
  });
});
