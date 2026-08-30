import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El catálogo del gimnasio.
 *
 * Lo que se cuida es que alcance para armar rutinas completas en cualquier
 * nivel: el generador filtra por nivel, así que un hueco —una zona sin
 * ejercicios de principiante, un rol que solo existe en avanzado— se traduce
 * en una sesión con menos ejercicios de los que pide el plan.
 */

type Ejercicio = {
  name: string;
  muscleGroup: string;
  poolRole: string;
  level: string;
  equipment: string;
  howTo?: string;
  whyFor?: string;
  watchOut?: string;
  substitutes: string[];
};

const CATALOGO: Ejercicio[] = JSON.parse(
  readFileSync(join(process.cwd(), "prisma/exercises.json"), "utf8"),
);

const ZONAS = ["PIERNA", "HOMBRO", "PECHO", "ESPALDA", "BICEP", "TRICEP", "ABDOMEN"];
const NIVELES = ["PRINCIPIANTE", "INTERMEDIO", "AVANZADO"];

describe("catálogo del gimnasio", () => {
  it("cada zona tiene ejercicios de principiante: la rutina se arma desde ahí", () => {
    for (const zona of ZONAS) {
      const deZona = CATALOGO.filter(
        (ejercicio) => ejercicio.muscleGroup === zona && ejercicio.level === "PRINCIPIANTE",
      );
      expect(deZona.length, zona).toBeGreaterThanOrEqual(3);
    }
  });

  it("cada zona tiene variedad suficiente para no repetir semana a semana", () => {
    for (const zona of ZONAS) {
      const deZona = CATALOGO.filter((ejercicio) => ejercicio.muscleGroup === zona);
      expect(deZona.length, zona).toBeGreaterThanOrEqual(8);
    }
  });

  it("todos declaran un nivel y un equipo válidos", () => {
    for (const ejercicio of CATALOGO) {
      expect(NIVELES, ejercicio.name).toContain(ejercicio.level);
      expect(
        ["BARRA", "MANCUERNA", "MAQUINA", "POLEA", "PESO_CORPORAL"],
        ejercicio.name,
      ).toContain(ejercicio.equipment);
    }
  });

  it("todos traen su ficha completa para la biblioteca", () => {
    for (const ejercicio of CATALOGO) {
      expect(ejercicio.howTo?.length ?? 0, ejercicio.name).toBeGreaterThan(30);
      expect(ejercicio.whyFor?.length ?? 0, ejercicio.name).toBeGreaterThan(30);
      expect(ejercicio.watchOut?.length ?? 0, ejercicio.name).toBeGreaterThan(20);
    }
  });

  it("los básicos con barra están, no solo sus versiones guiadas", () => {
    const nombres = CATALOGO.map((ejercicio) => ejercicio.name.toLowerCase());
    for (const basico of [
      "sentadilla con barra",
      "peso muerto",
      "bench press",
      "press militar con barra",
      "remo con barra",
      "dominadas",
      "remo en polea sentado",
      "press con mancuernas plano",
    ]) {
      expect(nombres.some((nombre) => nombre.includes(basico)), basico).toBe(true);
    }
  });

  it("los sustitutos apuntan a ejercicios que existen", () => {
    const nombres = new Set(CATALOGO.map((ejercicio) => ejercicio.name));
    for (const ejercicio of CATALOGO) {
      for (const sustituto of ejercicio.substitutes) {
        expect(nombres.has(sustituto), `${ejercicio.name} → ${sustituto}`).toBe(true);
      }
    }
  });

  it("no hay nombres repetidos", () => {
    const nombres = CATALOGO.map((ejercicio) => ejercicio.name);
    expect(new Set(nombres).size).toBe(nombres.length);
  });
});
