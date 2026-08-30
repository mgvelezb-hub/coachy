import { describe, expect, it } from "vitest";

import {
  BIBLIOTECA_POR_DISCIPLINA,
  ORDEN_NIVEL,
  porCategoria,
  porNivel,
  resumenDeBiblioteca,
} from "@/lib/tecnica";

/**
 * La biblioteca de cada disciplina.
 *
 * El criterio que se prueba es el que la hace útil: que estén los movimientos
 * que la sesión pide por nombre. Una biblioteca sin thruster no le sirve a
 * quien acaba de leer "thruster" en su WOD.
 */

const DISCIPLINAS = Object.entries(BIBLIOTECA_POR_DISCIPLINA);

describe("catálogo por disciplina", () => {
  it("todas tienen ejercicios en los tres niveles o justifican el hueco", () => {
    for (const [disciplina, ejercicios] of DISCIPLINAS) {
      expect(ejercicios.length, disciplina).toBeGreaterThanOrEqual(15);

      const niveles = new Set(ejercicios.map((ejercicio) => ejercicio.nivel));
      expect(niveles.has("PRINCIPIANTE"), disciplina).toBe(true);
      expect(niveles.has("INTERMEDIO"), disciplina).toBe(true);
    }
  });

  it("cada ficha está completa: cómo, para qué y el error común", () => {
    for (const [disciplina, ejercicios] of DISCIPLINAS) {
      for (const ejercicio of ejercicios) {
        const donde = `${disciplina}/${ejercicio.id}`;
        expect(ejercicio.como.length, donde).toBeGreaterThan(30);
        expect(ejercicio.para.length, donde).toBeGreaterThan(30);
        expect(ejercicio.ojo.length, donde).toBeGreaterThan(20);
        expect(ORDEN_NIVEL, donde).toContain(ejercicio.nivel);
      }
    }
  });

  it("no hay ids repetidos dentro de una disciplina", () => {
    for (const [disciplina, ejercicios] of DISCIPLINAS) {
      const ids = ejercicios.map((ejercicio) => ejercicio.id);
      expect(new Set(ids).size, disciplina).toBe(ids.length);
    }
  });
});

describe("los movimientos que la sesión pide por nombre", () => {
  function nombres(disciplina: keyof typeof BIBLIOTECA_POR_DISCIPLINA): string {
    return (BIBLIOTECA_POR_DISCIPLINA[disciplina] ?? [])
      .map((ejercicio) => `${ejercicio.id} ${ejercicio.nombre}`)
      .join(" ")
      .toLowerCase();
  }

  it("CrossFit tiene los movimientos reales del deporte", () => {
    const texto = nombres("CROSSFIT");
    for (const movimiento of [
      "clean",
      "jerk",
      "snatch",
      "thruster",
      "box jump",
      "burpee",
      "peso muerto",
      "wall ball",
      "muscle-up",
      "toes to bar",
      "double under",
    ]) {
      expect(texto, movimiento).toContain(movimiento);
    }
  });

  it("Box tiene golpes, defensas, combinaciones y aparatos", () => {
    const box = BIBLIOTECA_POR_DISCIPLINA.BOX ?? [];
    const categorias = new Set(box.map((ejercicio) => ejercicio.categoria));

    for (const categoria of ["Golpeo", "Defensa", "Combinaciones", "Aparatos"]) {
      expect(categorias, categoria).toContain(categoria);
    }

    const texto = nombres("BOX");
    for (const movimiento of ["jab", "gancho", "uppercut", "sombra", "saco", "slip"]) {
      expect(texto, movimiento).toContain(movimiento);
    }
  });

  it("Funcional cubre fuerza y cardiovascular, no solo circuitos", () => {
    const funcional = BIBLIOTECA_POR_DISCIPLINA.FUNCIONAL ?? [];
    const categorias = new Set(funcional.map((ejercicio) => ejercicio.categoria));

    for (const categoria of ["Patrones", "Empuje", "Tirón", "Core", "Cardiovascular", "Acarreos"]) {
      expect(categorias, categoria).toContain(categoria);
    }
  });

  it("Squash separa golpes de movimiento, que es donde están los errores", () => {
    const squash = BIBLIOTECA_POR_DISCIPLINA.SQUASH ?? [];
    const categorias = new Set(squash.map((ejercicio) => ejercicio.categoria));

    expect(categorias).toContain("Golpes");
    expect(categorias).toContain("Movimiento");
    expect(categorias).toContain("Ejercicios");
  });

  it("Correr trae tipos de sesión, no solo técnica", () => {
    const correr = BIBLIOTECA_POR_DISCIPLINA.CARDIO ?? [];
    const categorias = new Set(correr.map((ejercicio) => ejercicio.categoria));

    expect(categorias).toContain("Sesiones");
    expect(categorias).toContain("Fuerza");
  });

  it("Natación cubre los cuatro estilos", () => {
    const texto = nombres("NATACION");
    for (const estilo of ["crol", "espalda", "pecho", "mariposa"]) {
      expect(texto, estilo).toContain(estilo);
    }
  });
});

describe("cómo se presenta", () => {
  it("el resumen se lee igual que el de gimnasio", () => {
    const ejercicios = BIBLIOTECA_POR_DISCIPLINA.BOX ?? [];
    expect(resumenDeBiblioteca(ejercicios)).toBe(`0 videos · ${ejercicios.length} ejercicios`);
  });

  it("agrupar por nivel respeta el orden de aprendizaje", () => {
    const grupos = porNivel(BIBLIOTECA_POR_DISCIPLINA.CROSSFIT ?? []);
    expect(grupos.map((grupo) => grupo.nivel)).toEqual([
      "PRINCIPIANTE",
      "INTERMEDIO",
      "AVANZADO",
    ]);
  });

  it("agrupar por categoría conserva el orden del catálogo", () => {
    const familias = porCategoria(BIBLIOTECA_POR_DISCIPLINA.FUNCIONAL ?? []);
    expect(familias[0]!.categoria).toBe("Patrones");
    expect(familias.every((familia) => familia.ejercicios.length > 0)).toBe(true);
  });
});
