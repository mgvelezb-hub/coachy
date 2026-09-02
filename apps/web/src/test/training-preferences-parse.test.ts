import { describe, expect, it } from "vitest";

import { parseDisciplineLoads, parseSchemePreference, parseTimePerDay } from "@/lib/training/db";

/**
 * `other_disciplines` y `time_per_day` son JSON libre en la base: pruebas
 * puras, no tocan Postgres.
 *
 * Lo que importa no es que el parser acepte JSON bien formado —eso es
 * trivial—, sino que una preferencia corrupta se recorte campo por campo en
 * vez de tirar la entrada entera. Una disciplina activa es lo que decide si
 * alguien tiene rutina esa semana; perderla por un `importancia: 7` mal
 * tecleado en otro campo sería el mismo bug que ya evita `parseDisciplineLoads`
 * para `discipline`/`sessionsPerWeek`.
 */
describe("parseDisciplineLoads", () => {
  it("acepta entradas viejas sin proposito ni importancia", () => {
    const loads = parseDisciplineLoads([{ discipline: "NATACION", sessionsPerWeek: 2 }]);

    expect(loads).toEqual([{ discipline: "NATACION", sessionsPerWeek: 2 }]);
    expect(loads[0]).not.toHaveProperty("proposito");
    expect(loads[0]).not.toHaveProperty("importancia");
  });

  it("conserva proposito e importancia cuando vienen válidos", () => {
    const loads = parseDisciplineLoads([
      { discipline: "SQUASH", sessionsPerWeek: 1, proposito: "HOBBY", importancia: 2 },
    ]);

    expect(loads).toEqual([
      { discipline: "SQUASH", sessionsPerWeek: 1, proposito: "HOBBY", importancia: 2 },
    ]);
  });

  it("descarta una importancia fuera de rango pero conserva la entrada", () => {
    const loads = parseDisciplineLoads([
      { discipline: "BOX", sessionsPerWeek: 3, proposito: "ENTRENAMIENTO", importancia: 7 },
    ]);

    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ discipline: "BOX", sessionsPerWeek: 3, proposito: "ENTRENAMIENTO" });
    expect(loads[0]).not.toHaveProperty("importancia");
  });

  it("descarta un proposito que no existe pero conserva la entrada", () => {
    const loads = parseDisciplineLoads([
      { discipline: "CARDIO", sessionsPerWeek: 2, proposito: "OBLIGACION", importancia: 1 },
    ]);

    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ discipline: "CARDIO", sessionsPerWeek: 2, importancia: 1 });
    expect(loads[0]).not.toHaveProperty("proposito");
  });

  it("una importancia no entera también se descarta sin tumbar la entrada", () => {
    const loads = parseDisciplineLoads([
      { discipline: "FUNCIONAL", sessionsPerWeek: 2, importancia: 1.5 },
    ]);

    expect(loads).toHaveLength(1);
    expect(loads[0]).not.toHaveProperty("importancia");
  });

  it("sigue descartando la entrada entera si falta discipline o sessionsPerWeek", () => {
    expect(parseDisciplineLoads([{ proposito: "HOBBY", importancia: 2 }])).toEqual([]);
    expect(parseDisciplineLoads([{ discipline: "PESAS" }])).toEqual([]);
  });

  it("raíz que no es arreglo devuelve lista vacía", () => {
    expect(parseDisciplineLoads(null)).toEqual([]);
    expect(parseDisciplineLoads("basura")).toEqual([]);
    expect(parseDisciplineLoads({ discipline: "PESAS", sessionsPerWeek: 1 })).toEqual([]);
  });
});

describe("parseTimePerDay", () => {
  it("acepta un mapa completo y clampa valores dentro de 0-300", () => {
    const parsed = parseTimePerDay({ LUN: 60, MAR: 90, MIE: -10, JUE: 500 });

    expect(parsed).toEqual({ LUN: 60, MAR: 90, MIE: 0, JUE: 300 });
  });

  it("ignora llaves que no son días conocidos", () => {
    const parsed = parseTimePerDay({ LUN: 45, LUNES: 999, foo: "bar" });

    expect(parsed).toEqual({ LUN: 45 });
  });

  it("ignora valores que no son número finito", () => {
    const parsed = parseTimePerDay({ LUN: "60", MAR: null, MIE: 45 });

    expect(parsed).toEqual({ MIE: 45 });
  });

  it("basura total (nada usable) devuelve null, igual que 'no declarado'", () => {
    expect(parseTimePerDay({ foo: 1, bar: 2 })).toBeNull();
    expect(parseTimePerDay(null)).toBeNull();
    expect(parseTimePerDay(undefined)).toBeNull();
    expect(parseTimePerDay("60")).toBeNull();
    expect(parseTimePerDay([60, 90])).toBeNull();
    expect(parseTimePerDay({})).toBeNull();
  });

  it("trunca minutos con decimales", () => {
    expect(parseTimePerDay({ LUN: 59.9 })).toEqual({ LUN: 59 });
  });
});

/**
 * `scheme_preference` es `TEXT` libre en la base, no un enum de Postgres: un
 * valor viejo o corrupto no puede tumbar la generación de la semana, así que
 * cae de vuelta a `RECOMENDADO` (la rotación de siempre) en vez de fallar.
 */
describe("parseSchemePreference", () => {
  it("acepta los cuatro valores válidos tal cual", () => {
    expect(parseSchemePreference("RECOMENDADO")).toBe("RECOMENDADO");
    expect(parseSchemePreference("FUERZA")).toBe("FUERZA");
    expect(parseSchemePreference("HIPERTROFIA")).toBe("HIPERTROFIA");
    expect(parseSchemePreference("METABOLICO")).toBe("METABOLICO");
  });

  it("un valor desconocido cae a RECOMENDADO", () => {
    expect(parseSchemePreference("PESO_MEDIO")).toBe("RECOMENDADO");
    expect(parseSchemePreference("")).toBe("RECOMENDADO");
    expect(parseSchemePreference("recomendado")).toBe("RECOMENDADO"); // mayúsculas exactas
  });
});
