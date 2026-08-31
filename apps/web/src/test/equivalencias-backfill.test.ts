import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { rellenaEquivalencias } from "@/lib/coachy/equivalencias-backfill";

/**
 * El perfil mínimo que el motor necesita para saber qué alimentos son
 * elegibles (presupuesto, dieta, exclusiones).
 */
const PERFIL = {
  sex: "M",
  age: 34,
  heightCm: 178,
  weightKg: 86,
  activity: "moderada",
  goal: "recomposicion",
  budget: "alto",
  diet: "omnivora",
  excludedFoods: [],
  allergies: [],
  favoriteFoods: [],
  cookMinutes: 40,
  mealsPerDay: 5,
} as never;

function comidaCon(
  items: Array<Record<string, unknown>>,
  equivalences: unknown[] = [],
): Prisma.JsonValue {
  return [
    { slot: "desayuno", label: "Desayuno", timeHint: "7:00 am", items, equivalences },
  ] as unknown as Prisma.JsonValue;
}

describe("rellenaEquivalencias", () => {
  it("le da opciones a un vegetal libre que se guardó sin ninguna", () => {
    const meals = comidaCon([{ name: "Espinaca", grams: 200, free: true }]);

    const resultado = rellenaEquivalencias(meals, [], PERFIL);

    expect(resultado.cambiado).toBe(true);
    const equivalencias = (resultado.mealsJson as any[])[0].equivalences;
    expect(equivalencias).toHaveLength(1);
    expect(equivalencias[0].forName).toBe("Espinaca");
    expect(equivalencias[0].options.length).toBeGreaterThanOrEqual(3);
  });

  it("completa una lista corta sin mover ni borrar lo que ya estaba", () => {
    // "Amaranto" es la opción de volver que dejó un intercambio anterior: no
    // se puede perder ni cambiar de lugar.
    const meals = comidaCon(
      [{ name: "Avena", grams: 60, free: false }],
      [{ forName: "Avena", options: [{ name: "Amaranto", grams: 55 }] }],
    );

    const resultado = rellenaEquivalencias(meals, [], PERFIL);

    expect(resultado.cambiado).toBe(true);
    const opciones = (resultado.mealsJson as any[])[0].equivalences[0].options;
    expect(opciones[0]).toEqual({ name: "Amaranto", grams: 55 });
    expect(opciones.length).toBeGreaterThan(1);
  });

  it("no toca una lista que ya tiene de dónde elegir", () => {
    const meals = comidaCon(
      [{ name: "Avena", grams: 60, free: false }],
      [
        {
          forName: "Avena",
          options: [
            { name: "Amaranto", grams: 55 },
            { name: "Arroz integral", grams: 50 },
            { name: "Quinoa", grams: 50 },
          ],
        },
      ],
    );

    const resultado = rellenaEquivalencias(meals, [], PERFIL);

    expect(resultado.cambiado).toBe(false);
    expect(resultado.mealsJson).toBe(meals);
  });

  it("un alimento que no está en el catálogo se deja en paz", () => {
    const meals = comidaCon([{ name: "Guiso de la abuela", grams: 200, free: false }]);

    const resultado = rellenaEquivalencias(meals, [], PERFIL);

    expect(resultado.cambiado).toBe(false);
  });

  it("la copia aplanada queda con el slot de cada equivalencia", () => {
    const meals = comidaCon([{ name: "Espinaca", grams: 200, free: true }]);

    const resultado = rellenaEquivalencias(meals, [], PERFIL);

    const plano = resultado.equivalencesJson as any[];
    expect(plano.length).toBeGreaterThan(0);
    expect(plano[0].slot).toBe("desayuno");
    expect(plano[0].forName).toBe("Espinaca");
  });
});
