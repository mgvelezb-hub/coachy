import { describe, expect, it } from "vitest";

import {
  FORECAST_MIN_WEEKS,
  forecast,
  forecastWindow,
  linearFit,
  type TrendPoint,
} from "@/lib/observatory/trend";

/**
 * El pronóstico es la parte del observatorio que más fácil miente. Estas
 * pruebas fijan las tres cosas que lo mantienen honesto: que las semanas no
 * concluyentes no entren, que la banda no colapse cuando la recta pasa por
 * todos los puntos, y que con dos semanas diga que no confía.
 */

function series(values: Array<[string, number, boolean?]>): TrendPoint[] {
  return values.map(([date, value, inconclusive]) => ({ date, value, inconclusive }));
}

const SIX_WEEKS = series([
  ["2026-07-05", 92],
  ["2026-07-12", 91.5],
  ["2026-07-19", 91],
  ["2026-07-26", 90.6],
  ["2026-08-02", 90],
  ["2026-08-09", 89.6],
]);

describe("forecastWindow", () => {
  it("saca las semanas no concluyentes de la ventana", () => {
    const points = series([
      ["2026-07-05", 92],
      ["2026-07-12", 93, true],
      ["2026-07-19", 91],
    ]);
    expect(forecastWindow(points).map((point) => point.date)).toEqual([
      "2026-07-05",
      "2026-07-19",
    ]);
  });

  it("se queda con las últimas seis y las ordena", () => {
    const points = series([
      ["2026-08-09", 89.6],
      ["2026-05-31", 94],
      ["2026-06-07", 93.5],
      ["2026-06-14", 93],
      ["2026-06-21", 92.5],
      ["2026-06-28", 92.2],
      ["2026-07-05", 92],
      ["2026-07-12", 91.5],
    ]);
    const window = forecastWindow(points);
    expect(window).toHaveLength(6);
    expect(window[0]!.date).toBe("2026-06-14");
    expect(window.at(-1)!.date).toBe("2026-08-09");
  });
});

describe("linearFit", () => {
  it("recupera la pendiente exacta de una serie perfectamente lineal", () => {
    const fit = linearFit(
      series([
        ["2026-07-05", 92],
        ["2026-07-12", 91.5],
        ["2026-07-19", 91],
        ["2026-07-26", 90.5],
      ]),
    );
    expect(fit?.slopePerWeek).toBeCloseTo(-0.5, 6);
    expect(fit?.intercept).toBeCloseTo(92, 6);
    expect(fit?.r2).toBeCloseTo(1, 6);
  });

  it("mide en semanas reales, no en número de check-in", () => {
    // Dos semanas de hueco entre el segundo y el tercer punto.
    const fit = linearFit(
      series([
        ["2026-07-05", 92],
        ["2026-07-12", 91],
        ["2026-07-26", 89],
      ]),
    );
    expect(fit?.slopePerWeek).toBeCloseTo(-1, 6);
  });

  it("no da error estándar con dos puntos: la recta pasa por los dos", () => {
    const fit = linearFit(series([["2026-07-05", 92], ["2026-07-12", 91]]));
    expect(fit?.n).toBe(2);
    expect(fit?.residualSd).toBeNull();
  });

  it("devuelve null sin puntos suficientes o sin eje x", () => {
    expect(linearFit(series([["2026-07-05", 92]]))).toBeNull();
    expect(linearFit(series([["2026-07-05", 92], ["2026-07-05", 91]]))).toBeNull();
  });
});

describe("forecast", () => {
  it("proyecta el ritmo reciente a cuatro semanas", () => {
    const result = forecast(SIX_WEEKS, 4);
    expect(result).not.toBeNull();
    expect(result!.n).toBe(6);
    expect(result!.currentValue).toBe(89.6);
    expect(result!.slopePerWeek).toBeCloseTo(-0.48, 2);
    // el ajuste arranca un poco por debajo del último punto: ~87.6, no 89.6 − 4 × 0.48
    expect(result!.projected).toBe(87.6);
    expect(result!.targetDate).toBe("2026-09-06");
    expect(result!.confident).toBe(true);
  });

  it("abre una banda de incertidumbre alrededor de la proyección", () => {
    const noisy = series([
      ["2026-07-05", 92],
      ["2026-07-12", 91.8],
      ["2026-07-19", 91],
      ["2026-07-26", 91.2],
      ["2026-08-02", 90.1],
    ]);
    const result = forecast(noisy, 4)!;
    expect(result.low).toBeLessThan(result.projected);
    expect(result.high).toBeGreaterThan(result.projected);
  });

  it("no finge certeza con dos semanas", () => {
    const result = forecast(series([["2026-08-02", 90], ["2026-08-09", 89]]), 4)!;
    expect(result.n).toBe(2);
    expect(result.confident).toBe(false);
    // Sin residuos que medir, la banda colapsa: no se pinta como intervalo.
    expect(result.low).toBe(result.projected);
    expect(result.high).toBe(result.projected);
    expect(result.warning).toMatch(/dos semanas no hacen una tendencia/i);
  });

  it("ignora las semanas no concluyentes al calcular el ritmo", () => {
    const withRetention = series([
      ["2026-07-05", 92],
      ["2026-07-12", 91.5],
      ["2026-07-19", 91],
      ["2026-07-26", 93.5, true],
      ["2026-08-02", 90.5],
    ]);
    const result = forecast(withRetention, 4)!;
    expect(result.n).toBe(4);
    expect(result.slopePerWeek).toBeLessThan(0);
  });

  it("marca confianza a partir de la ventana mínima", () => {
    const four = SIX_WEEKS.slice(-FORECAST_MIN_WEEKS);
    expect(forecast(four, 4)!.confident).toBe(true);
    expect(forecast(SIX_WEEKS.slice(-3), 4)!.confident).toBe(false);
  });

  it("devuelve null cuando no hay nada concluyente que regresar", () => {
    expect(forecast(series([["2026-08-02", 90, true]]), 4)).toBeNull();
    expect(forecast([], 4)).toBeNull();
  });
});
