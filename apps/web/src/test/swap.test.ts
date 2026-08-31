import { describe, expect, it } from "vitest";

import { SwapError, applySwap } from "@/lib/coachy/swap";

/** Un menú mínimo de una sola comida, con Avena↔Amaranto como equivalencia. */
function mealsJsonDeAvena() {
  return [
    {
      slot: "desayuno",
      label: "Desayuno",
      timeHint: "7:00 am",
      allowDenseCarb: true,
      items: [
        { name: "Avena", grams: 60, free: false },
        { name: "Huevo", grams: 100, free: false },
      ],
      equivalences: [
        {
          forName: "Avena",
          options: [
            { name: "Amaranto", grams: 55 },
            { name: "Pan integral", grams: 70 },
          ],
        },
      ],
    },
  ];
}

function equivalencesJsonDeAvena() {
  return [
    {
      slot: "desayuno",
      forName: "Avena",
      options: [
        { name: "Amaranto", grams: 55 },
        { name: "Pan integral", grams: 70 },
      ],
    },
  ];
}

describe("applySwap", () => {
  it("cambia el item y voltea la equivalencia (caso feliz)", () => {
    const resultado = applySwap(mealsJsonDeAvena(), equivalencesJsonDeAvena(), {
      slot: "desayuno",
      forName: "Avena",
      toName: "Amaranto",
    });

    const meals = resultado.mealsJson as any[];
    const comida = meals[0];

    // El item pasa a ser la elección, con los gramos EXACTOS de la opción.
    expect(comida.items).toEqual([
      { name: "Amaranto", grams: 55, free: false },
      { name: "Huevo", grams: 100, free: false },
    ]);

    // La equivalencia ahora se busca desde "Amaranto", y "Avena" quedó como
    // la opción para volver, con sus gramos originales.
    expect(comida.equivalences).toEqual([
      {
        forName: "Amaranto",
        options: [
          { name: "Avena", grams: 60 },
          { name: "Pan integral", grams: 70 },
        ],
      },
    ]);

    // La copia aplanada queda coherente con la de la comida.
    const flat = resultado.equivalencesJson as any[];
    expect(flat).toEqual([
      {
        slot: "desayuno",
        forName: "Amaranto",
        options: [
          { name: "Avena", grams: 60 },
          { name: "Pan integral", grams: 70 },
        ],
      },
    ]);

    // El otro item de la comida no se toca.
    expect(comida.items[1]).toEqual({ name: "Huevo", grams: 100, free: false });
  });

  it("ida y vuelta: swap A→B y luego B→A regresa exactamente al original", () => {
    const mealsOriginal = mealsJsonDeAvena();
    const equivalencesOriginal = equivalencesJsonDeAvena();

    const ida = applySwap(mealsOriginal, equivalencesOriginal, {
      slot: "desayuno",
      forName: "Avena",
      toName: "Amaranto",
    });

    const vuelta = applySwap(ida.mealsJson, ida.equivalencesJson, {
      slot: "desayuno",
      forName: "Amaranto",
      toName: "Avena",
    });

    expect(vuelta.mealsJson).toEqual(mealsOriginal);
    expect(vuelta.equivalencesJson).toEqual(equivalencesOriginal);
  });

  it("lanza SwapError si el slot no existe", () => {
    expect(() =>
      applySwap(mealsJsonDeAvena(), equivalencesJsonDeAvena(), {
        slot: "cena",
        forName: "Avena",
        toName: "Amaranto",
      }),
    ).toThrow(SwapError);
  });

  it("lanza SwapError si forName no está en la comida", () => {
    expect(() =>
      applySwap(mealsJsonDeAvena(), equivalencesJsonDeAvena(), {
        slot: "desayuno",
        forName: "Camote",
        toName: "Amaranto",
      }),
    ).toThrow(SwapError);
  });

  it("lanza SwapError si toName no es una opción válida para forName", () => {
    expect(() =>
      applySwap(mealsJsonDeAvena(), equivalencesJsonDeAvena(), {
        slot: "desayuno",
        forName: "Avena",
        toName: "Quinoa",
      }),
    ).toThrow(SwapError);
  });
});
