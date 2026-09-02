import { describe, expect, it } from "vitest";

import { calcularAgregadosGolf, type GolfPracticeInput, type GolfRoundInput } from "@/lib/golf";

/**
 * Agregados de golf.
 *
 * Lo que se cuida aquí: que un dato opcional ausente (par, putts, GIR,
 * fairways, castigos) nunca produzca `NaN` o una división entre cero — debe
 * quedar en `null`, honesto sobre que no hay suficiente dato, nunca un número
 * inventado. Y que la tendencia y el diferencial no se calculen con muestras
 * demasiado chicas para significar algo.
 */

function ronda(overrides: Partial<GolfRoundInput> & { date: string; score: number }): GolfRoundInput {
  return {
    holes: 18,
    par: null,
    putts: null,
    fairwaysHit: null,
    fairwaysTotal: null,
    girHit: null,
    penalties: null,
    ...overrides,
  };
}

function practica(overrides: Partial<GolfPracticeInput> & { date: string }): GolfPracticeInput {
  return { kind: "RANGE", minutes: 30, balls: null, ...overrides };
}

describe("scoreVsPar", () => {
  it("promedia score - par de las rondas con par", () => {
    const rondas = [
      ronda({ date: "2026-01-01", score: 90, par: 72 }),
      ronda({ date: "2026-01-08", score: 86, par: 72 }),
    ];
    const agregados = calcularAgregadosGolf(rondas, []);
    expect(agregados.scoreVsPar.todas).toBe(16); // (18 + 14) / 2
  });

  it("null cuando ninguna ronda trae par: no hay denominador que inventar", () => {
    const rondas = [ronda({ date: "2026-01-01", score: 90 })];
    const agregados = calcularAgregadosGolf(rondas, []);
    expect(agregados.scoreVsPar.todas).toBeNull();
    expect(agregados.scoreVsPar.ultimas5).toBeNull();
  });

  it("ultimas5 solo mira las 5 más recientes, aunque haya más rondas", () => {
    const viejas = Array.from({ length: 3 }, (_, i) =>
      ronda({ date: `2025-01-0${i + 1}`, score: 100, par: 72 }), // +28 cada una
    );
    const recientes = Array.from({ length: 5 }, (_, i) =>
      ronda({ date: `2026-02-0${i + 1}`, score: 82, par: 72 }), // +10 cada una
    );
    const agregados = calcularAgregadosGolf([...viejas, ...recientes], []);
    expect(agregados.scoreVsPar.ultimas5).toBe(10);
    // "todas" sí las mezcla, y por eso da distinto de "ultimas5".
    expect(agregados.scoreVsPar.todas).not.toBe(10);
  });

  it("no truena con rondas fuera de orden de fecha", () => {
    const rondas = [
      ronda({ date: "2026-03-01", score: 82, par: 72 }),
      ronda({ date: "2026-01-01", score: 100, par: 72 }),
      ronda({ date: "2026-02-01", score: 90, par: 72 }),
    ];
    const agregados = calcularAgregadosGolf(rondas, []);
    expect(agregados.scoreVsPar.todas).not.toBeNull();
  });
});

describe("GIR% y FIR%", () => {
  it("calcula GIR% sobre hoyos jugados", () => {
    const rondas = [
      ronda({ date: "2026-01-01", score: 90, holes: 18, girHit: 9 }),
      ronda({ date: "2026-01-08", score: 86, holes: 18, girHit: 12 }),
    ];
    const agregados = calcularAgregadosGolf(rondas, []);
    // (9 + 12) / (18 + 18) * 100
    expect(agregados.girPct).toBeCloseTo(58.3, 1);
  });

  it("null sin ninguna ronda con girHit", () => {
    const rondas = [ronda({ date: "2026-01-01", score: 90 })];
    expect(calcularAgregadosGolf(rondas, []).girPct).toBeNull();
  });

  it("calcula FIR% solo con rondas que traen ambos campos de fairways", () => {
    const rondas = [
      ronda({ date: "2026-01-01", score: 90, fairwaysHit: 7, fairwaysTotal: 14 }),
      ronda({ date: "2026-01-08", score: 86, fairwaysHit: 9, fairwaysTotal: 14 }), // solo cuenta esta y la anterior
      ronda({ date: "2026-01-15", score: 88, fairwaysHit: 8 }), // sin fairwaysTotal: se excluye
    ];
    const agregados = calcularAgregadosGolf(rondas, []);
    // (7 + 9) / (14 + 14) * 100
    expect(agregados.firPct).toBeCloseTo(57.1, 1);
  });

  it("null sin ninguna ronda con ambos campos de fairways", () => {
    const rondas = [ronda({ date: "2026-01-01", score: 90, fairwaysHit: 7 })];
    expect(calcularAgregadosGolf(rondas, []).firPct).toBeNull();
  });
});

describe("putts y castigos promedio", () => {
  it("promedia solo las rondas con el dato", () => {
    const rondas = [
      ronda({ date: "2026-01-01", score: 90, putts: 34, penalties: 3 }),
      ronda({ date: "2026-01-08", score: 86, putts: 30 }), // sin penalties
      ronda({ date: "2026-01-15", score: 88 }), // sin ninguno de los dos
    ];
    const agregados = calcularAgregadosGolf(rondas, []);
    expect(agregados.puttsPromedio).toBe(32); // (34 + 30) / 2
    expect(agregados.castigosPromedio).toBe(3); // solo la primera lo trae
  });

  it("null sin ninguna ronda con el dato: nunca NaN", () => {
    const rondas = [ronda({ date: "2026-01-01", score: 90 })];
    const agregados = calcularAgregadosGolf(rondas, []);
    expect(agregados.puttsPromedio).toBeNull();
    expect(agregados.castigosPromedio).toBeNull();
    expect(Number.isNaN(agregados.puttsPromedio)).toBe(false);
  });
});

describe("tendencia", () => {
  it("null con menos de 4 rondas utilizables: dos rondas no son tendencia", () => {
    const rondas = [
      ronda({ date: "2026-01-01", score: 90, par: 72 }),
      ronda({ date: "2026-01-08", score: 86, par: 72 }),
    ];
    expect(calcularAgregadosGolf(rondas, []).tendencia).toBeNull();
  });

  it("mejorando cuando la segunda mitad baja el score vs par", () => {
    const rondas = [
      ronda({ date: "2026-01-01", score: 96, par: 72 }), // +24
      ronda({ date: "2026-01-08", score: 94, par: 72 }), // +22
      ronda({ date: "2026-01-15", score: 84, par: 72 }), // +12
      ronda({ date: "2026-01-22", score: 82, par: 72 }), // +10
    ];
    expect(calcularAgregadosGolf(rondas, []).tendencia).toBe("MEJORANDO");
  });

  it("empeorando cuando la segunda mitad sube el score vs par", () => {
    const rondas = [
      ronda({ date: "2026-01-01", score: 82, par: 72 }),
      ronda({ date: "2026-01-08", score: 84, par: 72 }),
      ronda({ date: "2026-01-15", score: 94, par: 72 }),
      ronda({ date: "2026-01-22", score: 96, par: 72 }),
    ];
    expect(calcularAgregadosGolf(rondas, []).tendencia).toBe("EMPEORANDO");
  });

  it("estable cuando el score vs par no se mueve más del umbral", () => {
    const rondas = [
      ronda({ date: "2026-01-01", score: 90, par: 72 }),
      ronda({ date: "2026-01-08", score: 90, par: 72 }),
      ronda({ date: "2026-01-15", score: 90, par: 72 }),
      ronda({ date: "2026-01-22", score: 90, par: 72 }),
    ];
    expect(calcularAgregadosGolf(rondas, []).tendencia).toBe("ESTABLE");
  });

  it("solo cuenta rondas con par: sin par no hay diferencia que comparar", () => {
    const rondas = [
      ronda({ date: "2026-01-01", score: 96, par: 72 }),
      ronda({ date: "2026-01-08", score: 94 }), // sin par: no entra
      ronda({ date: "2026-01-15", score: 84, par: 72 }),
      ronda({ date: "2026-01-22", score: 82 }), // sin par: no entra
    ];
    // Solo quedan 2 rondas utilizables: por debajo del mínimo.
    expect(calcularAgregadosGolf(rondas, []).tendencia).toBeNull();
  });
});

describe("diferencial", () => {
  it("promedia las 3 mejores diferencias contra par de las últimas 10 rondas", () => {
    const scores = [100, 95, 90, 88, 85, 84, 83, 92, 96, 98]; // par 72 en todas
    const rondas = scores.map((score, i) =>
      ronda({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, score, par: 72 }),
    );
    const agregados = calcularAgregadosGolf(rondas, []);
    // Las 3 mejores diferencias: 83-72=11, 84-72=12, 85-72=13 → promedio 12
    expect(agregados.diferencial).toBe(12);
  });

  it("null con menos de 3 rondas con par: no hay con qué promediar 3 mejores", () => {
    const rondas = [
      ronda({ date: "2026-01-01", score: 90, par: 72 }),
      ronda({ date: "2026-01-08", score: 86, par: 72 }),
    ];
    expect(calcularAgregadosGolf(rondas, []).diferencial).toBeNull();
  });

  it("solo mira las últimas 10 rondas, no todo el historial", () => {
    // 11 rondas horribles antiguas + 3 recientes buenas: si el diferencial
    // mirara más de 10, las horribles seguirían contaminando el promedio.
    const antiguas = Array.from({ length: 11 }, (_, i) =>
      ronda({ date: `2025-01-${String(i + 1).padStart(2, "0")}`, score: 130, par: 72 }),
    );
    const recientes = [
      ronda({ date: "2026-02-01", score: 82, par: 72 }),
      ronda({ date: "2026-02-02", score: 84, par: 72 }),
      ronda({ date: "2026-02-03", score: 86, par: 72 }),
    ];
    const agregados = calcularAgregadosGolf([...antiguas, ...recientes], []);
    // Ventana de 10 = última de las antiguas (+58) + las 3 recientes; las 3
    // mejores son las 3 recientes: (10+12+14)/3 = 12.
    expect(agregados.diferencial).toBe(12);
  });
});

describe("balance de práctica", () => {
  it("reparte minutos por tipo en porcentaje del total", () => {
    const practicas = [
      practica({ date: "2026-01-01", kind: "RANGE", minutes: 60 }),
      practica({ date: "2026-01-02", kind: "PUTTING", minutes: 20 }),
      practica({ date: "2026-01-03", kind: "JUEGO_CORTO", minutes: 20 }),
    ];
    const agregados = calcularAgregadosGolf([], practicas);
    expect(agregados.practica.totalMinutos).toBe(100);
    expect(agregados.practica.balancePorTipo.RANGE).toBe(60);
    expect(agregados.practica.balancePorTipo.PUTTING).toBe(20);
    expect(agregados.practica.balancePorTipo.JUEGO_CORTO).toBe(20);
  });

  it("sin práctica registrada, el balance queda vacío y no NaN", () => {
    const agregados = calcularAgregadosGolf([], []);
    expect(agregados.practica.totalMinutos).toBe(0);
    expect(agregados.practica.balancePorTipo).toEqual({});
  });

  it("enseña el desbalance clásico: casi todo al range, casi nada al corto o al putting", () => {
    const practicas = [
      practica({ date: "2026-01-01", kind: "RANGE", minutes: 90 }),
      practica({ date: "2026-01-02", kind: "PUTTING", minutes: 10 }),
    ];
    const agregados = calcularAgregadosGolf([], practicas);
    expect(agregados.practica.balancePorTipo.RANGE).toBe(90);
    expect(agregados.practica.balancePorTipo.JUEGO_CORTO).toBeUndefined();
  });
});

describe("sin ninguna ronda ni práctica", () => {
  it("no truena, todo queda en null/0 honesto", () => {
    const agregados = calcularAgregadosGolf([], []);
    expect(agregados.rondas).toBe(0);
    expect(agregados.scoreVsPar).toEqual({ ultimas5: null, todas: null });
    expect(agregados.girPct).toBeNull();
    expect(agregados.firPct).toBeNull();
    expect(agregados.puttsPromedio).toBeNull();
    expect(agregados.castigosPromedio).toBeNull();
    expect(agregados.tendencia).toBeNull();
    expect(agregados.diferencial).toBeNull();
  });
});
