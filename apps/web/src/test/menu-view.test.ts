import { describe, expect, it } from "vitest";

import { toGroceries, toMenuView } from "@/lib/coachy/menu-view";

describe("toMenuView", () => {
  it("aplana un menú completo con items y equivalencias", () => {
    const mealsJson = [
      {
        slot: "desayuno",
        label: "Desayuno",
        timeHint: "7:00 am",
        allowDenseCarb: true,
        items: [{ name: "Avena", grams: 60, free: false }],
        equivalences: [
          {
            forName: "Avena",
            options: [{ name: "Amaranto", grams: 55 }],
          },
        ],
      },
    ];

    const view = toMenuView(1, mealsJson);

    expect(view).toEqual({
      menuNumber: 1,
      meals: [
        {
          slot: "desayuno",
          label: "Desayuno",
          timeHint: "7:00 am",
          allowDenseCarb: true,
          items: [{ name: "Avena", grams: 60, free: false }],
          equivalences: [{ forName: "Avena", options: [{ name: "Amaranto", grams: 55 }] }],
        },
      ],
    });
  });

  it("trata allowDenseCarb ausente como true: solo false lo apaga", () => {
    const view = toMenuView(1, [{ slot: "a", label: "A", timeHint: "", items: [] }]);
    expect(view.meals[0]?.allowDenseCarb).toBe(true);
  });

  it("no truena si mealsJson no es un arreglo", () => {
    expect(toMenuView(1, null)).toEqual({ menuNumber: 1, meals: [] });
    expect(toMenuView(2, { foo: "bar" })).toEqual({ menuNumber: 2, meals: [] });
  });

  it("no truena si items o equivalences faltan en una comida", () => {
    const view = toMenuView(1, [{ slot: "a", label: "A", timeHint: "" }]);
    expect(view.meals[0]?.items).toEqual([]);
    expect(view.meals[0]?.equivalences).toEqual([]);
  });
});

describe("toGroceries", () => {
  it("aplana la lista de súper", () => {
    const json = [{ name: "Pollo", grams: 500, unit: "g" }];
    expect(toGroceries(json)).toEqual([{ name: "Pollo", grams: 500, unit: "g" }]);
  });

  it("devuelve un arreglo vacío si el json no es un arreglo", () => {
    expect(toGroceries(null)).toEqual([]);
    expect(toGroceries({ not: "an array" })).toEqual([]);
  });
});
