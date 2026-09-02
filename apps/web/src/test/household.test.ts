import { describe, expect, it } from "vitest";

import { HouseholdError, enmascaraCorreo, generaCodigo, validaSuperComprados } from "@/lib/household";

/**
 * Lo puro de `@/lib/household`: generación de código, enmascarado de correo
 * y los límites de la lista de súper compartida — nada de esto toca
 * Postgres. Lo que sí necesita base vive en `household-db.test.ts`, que se
 * salta solo si no hay Postgres levantado.
 */

describe("generaCodigo", () => {
  it("genera 6 caracteres", () => {
    expect(generaCodigo()).toHaveLength(6);
  });

  it("solo usa el alfabeto sin ambigüedades (sin O, I, 0, 1)", () => {
    for (let i = 0; i < 200; i++) {
      const codigo = generaCodigo();
      expect(codigo).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
      expect(codigo).not.toMatch(/[OI01]/);
    }
  });

  it("no repite siempre el mismo código", () => {
    const codigos = new Set(Array.from({ length: 50 }, () => generaCodigo()));
    // Con 32^6 combinaciones posibles, 50 tiros sin ninguna repetición es lo
    // esperado; si algo estuviera mal (semilla fija, alfabeto de 1 símbolo…)
    // este set colapsaría a un tamaño mucho menor.
    expect(codigos.size).toBeGreaterThan(1);
  });
});

describe("enmascaraCorreo", () => {
  it("deja la primera letra, oculta el resto del local y conserva el dominio", () => {
    expect(enmascaraCorreo("irma@gmail.com")).toBe("i***@gmail.com");
  });

  it("funciona con un local de una sola letra", () => {
    expect(enmascaraCorreo("i@gmail.com")).toBe("i***@gmail.com");
  });

  it("nunca deja ver el correo completo", () => {
    const correo = "mauricio.gonzalez@vpconsulting.mx";
    const enmascarado = enmascaraCorreo(correo);
    expect(enmascarado).not.toBe(correo);
    expect(enmascarado.endsWith("@vpconsulting.mx")).toBe(true);
    expect(enmascarado.startsWith("m***")).toBe(true);
  });
});

describe("validaSuperComprados", () => {
  it("acepta una lista vacía", () => {
    expect(() => validaSuperComprados([])).not.toThrow();
  });

  it("acepta hasta 200 artículos", () => {
    const items = Array.from({ length: 200 }, (_, i) => `artículo ${i}`);
    expect(() => validaSuperComprados(items)).not.toThrow();
  });

  it("rechaza más de 200 artículos", () => {
    const items = Array.from({ length: 201 }, (_, i) => `artículo ${i}`);
    expect(() => validaSuperComprados(items)).toThrow(HouseholdError);
  });

  it("acepta un artículo de exactamente 120 caracteres", () => {
    expect(() => validaSuperComprados(["a".repeat(120)])).not.toThrow();
  });

  it("rechaza un artículo de más de 120 caracteres", () => {
    expect(() => validaSuperComprados(["a".repeat(121)])).toThrow(HouseholdError);
  });
});
