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
          // La avena y el amaranto se pesan: su porción natural es `null`.
          // Un alimento por pieza —tortilla, huevo— sí trae texto aquí.
          items: [{ name: "Avena", grams: 60, free: false, portion: null }],
          equivalences: [
            { forName: "Avena", options: [{ name: "Amaranto", grams: 55, portion: null }] },
          ],
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
    // `portion` es null para lo que se compra a granel: la pechuga se pesa,
    // no se cuenta.
    expect(toGroceries(json)).toEqual([
      { name: "Pollo", grams: 500, unit: "g", portion: null },
    ]);
  });

  it("lo que se vende por pieza se pide en piezas", () => {
    // "1260 g de naranja" no se pide en el súper: se piden siete naranjas.
    const json = [{ name: "Naranja", grams: 1260, unit: "g" }];
    expect(toGroceries(json)[0]?.portion).toContain("naranja");
  });

  it("devuelve un arreglo vacío si el json no es un arreglo", () => {
    expect(toGroceries(null)).toEqual([]);
    expect(toGroceries({ not: "an array" })).toEqual([]);
  });
});
