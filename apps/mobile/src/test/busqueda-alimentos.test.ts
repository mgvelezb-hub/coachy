import { describe, expect, it } from "vitest";

import { coincide, palabrasDe } from "@/lib/busqueda-alimentos";

const yogur = {
  nombre: "Yogur griego natural 0%",
  busqueda: ["yogur", "yogurt", "yoghurt", "griego", "natural", "0"],
};
const huevo = { nombre: "Huevo entero", busqueda: ["huevo", "entero", "clara", "blanquillo"] };

describe("coincide", () => {
  it("encuentra el yogur aunque se escriba con t", () => {
    expect(coincide(yogur, "Yogurt Griego")).toBe(true);
  });

  it("aguanta plurales y acentos", () => {
    expect(coincide(huevo, "huevos")).toBe(true);
    expect(coincide(yogur, "YOGÚRT")).toBe(true);
  });

  it("exige todas las palabras escritas", () => {
    expect(coincide(yogur, "yogurt entero")).toBe(false);
  });

  it("sin texto no filtra nada", () => {
    expect(coincide(yogur, "   ")).toBe(true);
  });

  it("sin términos del servidor cae al nombre", () => {
    expect(coincide({ nombre: "Papa cocida" }, "papa")).toBe(true);
    expect(coincide({ nombre: "Papa cocida" }, "palta")).toBe(false);
  });

  it("no parte palabras de una sola letra", () => {
    expect(palabrasDe("a b pollo")).toEqual(["pollo"]);
  });
});
