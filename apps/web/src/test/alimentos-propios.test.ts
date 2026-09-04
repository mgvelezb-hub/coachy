import { describe, expect, it } from "vitest";

import {
  alimentoPropioSchema,
  aFoodDelMotor,
  grupoDeRol,
  rolPorGrupo,
} from "@/lib/coachy/alimentos-propios";

const YOGURT = {
  name: "Yogurt griego marca X",
  role: "proteina_magra",
  proteinPer100: 10,
  carbPer100: 4,
  fatPer100: 0,
  fiberPer100: 0,
  servingUnit: "taza",
  gramsPerUnit: 240,
  minUnits: 0.5,
  maxUnits: 2,
  tags: [],
};

describe("alimentoPropioSchema", () => {
  it("acepta un alimento bien capturado", () => {
    expect(alimentoPropioSchema.safeParse(YOGURT).success).toBe(true);
  });

  it("rechaza un nombre de una letra y uno larguísimo", () => {
    expect(alimentoPropioSchema.safeParse({ ...YOGURT, name: "Y" }).success).toBe(false);
    expect(alimentoPropioSchema.safeParse({ ...YOGURT, name: "y".repeat(61) }).success).toBe(false);
  });

  it("rechaza un rol que el motor no conoce", () => {
    expect(alimentoPropioSchema.safeParse({ ...YOGURT, role: "postre" }).success).toBe(false);
  });

  it("rechaza macros fuera de 0-100 por cada 100 g", () => {
    expect(alimentoPropioSchema.safeParse({ ...YOGURT, proteinPer100: -1 }).success).toBe(false);
    expect(alimentoPropioSchema.safeParse({ ...YOGURT, fatPer100: 101 }).success).toBe(false);
  });

  it("rechaza que proteína, carbo y grasa sumen más de 100 g", () => {
    const imposible = { ...YOGURT, proteinPer100: 40, carbPer100: 40, fatPer100: 40 };
    expect(alimentoPropioSchema.safeParse(imposible).success).toBe(false);
  });

  it("rechaza fibra mayor que el carbohidrato", () => {
    const raro = { ...YOGURT, carbPer100: 4, fiberPer100: 9 };
    expect(alimentoPropioSchema.safeParse(raro).success).toBe(false);
  });

  it("exige una unidad casera de la lista y gramos por unidad positivos", () => {
    expect(alimentoPropioSchema.safeParse({ ...YOGURT, servingUnit: "kilo" }).success).toBe(false);
    expect(alimentoPropioSchema.safeParse({ ...YOGURT, gramsPerUnit: 0 }).success).toBe(false);
  });

  it("exige mínimo menor o igual que máximo", () => {
    expect(alimentoPropioSchema.safeParse({ ...YOGURT, minUnits: 3, maxUnits: 2 }).success).toBe(
      false,
    );
  });
});

describe("aFoodDelMotor", () => {
  const food = aFoodDelMotor({
    id: "11111111-1111-1111-1111-111111111111",
    ...YOGURT,
  });

  it("le pone el prefijo custom: para que no choque con el catálogo", () => {
    expect(food.id).toBe("custom:11111111-1111-1111-1111-111111111111");
  });

  it("deriva las kcal con 4/4/9", () => {
    expect(food.kcalPer100).toBe(56);
  });

  it("entra al escalón de precio intermedio, que es el default del catálogo", () => {
    expect(food.costRel).toBe(2);
  });

  it("copia la porción casera con su paso: pieza y scoop van de uno en uno", () => {
    expect(food.serving).toEqual({
      unit: "taza",
      gramsPerUnit: 240,
      minUnits: 0.5,
      maxUnits: 2,
      step: 0.5,
    });
    const pieza = aFoodDelMotor({ id: "x", ...YOGURT, servingUnit: "pieza", gramsPerUnit: 55 });
    expect(pieza.serving?.step).toBe(1);
  });

  it("se puede comer sin cocinar: es un producto de etiqueta", () => {
    expect(food.tags).toContain("rapido");
    expect(food.tags).toContain("sin_cocinar");
    expect(food.prepMin).toBe(0);
  });
});

describe("grupos de la pantalla", () => {
  it("el grupo de proteína se parte por grasa, como en el catálogo", () => {
    expect(rolPorGrupo("proteina", 2)).toBe("proteina_magra");
    expect(rolPorGrupo("proteina", 12)).toBe("proteina_grasa");
  });

  it("cada rol del motor sabe volver a su grupo", () => {
    expect(grupoDeRol("proteina_grasa")).toBe("proteina");
    expect(grupoDeRol("carbo_post")).toBe("carbo");
    expect(grupoDeRol("vegetal_libre")).toBe("verdura");
  });
});
