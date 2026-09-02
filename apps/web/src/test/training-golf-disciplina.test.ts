import { describe, expect, it } from "vitest";

import { GOLF } from "@/lib/training/disciplinas/golf";
import { DISCIPLINAS_PRESCRIBIBLES, prescribirSesion } from "@/lib/training/disciplinas";
import type { NivelDisciplina } from "@/lib/training/disciplinas/tipos";

/**
 * Generador de sesiones de golf (práctica por nivel).
 *
 * Golf es una "disciplina en paralelo": no toca el objetivo físico del
 * perfil, prescribe estructura de práctica. Lo que se cuida aquí es lo que el
 * generador promete en su docblock, no los textos exactos: cada nivel arma
 * estaciones distintas, la sesión nunca se pasa de los minutos del bloque, el
 * juego corto/putting siempre se lleva una porción real del tiempo (la regla
 * de strokes-gained), y la semana mueve el contenido (la práctica intercalada
 * no se puede repetir siempre igual, o deja de intercalar).
 */

const NIVELES: NivelDisciplina[] = ["PRINCIPIANTE", "INTERMEDIO", "AVANZADO"];

function generar(nivel: NivelDisciplina, isoWeek: number, minutes = 90, ordinal = 1) {
  return GOLF.sesion({ nivel, isoWeek, ordinal, minutes, objetivo: "RECOMPOSICION" });
}

describe("GOLF.sesion — estructura por nivel", () => {
  it("cada nivel trae entre 3 y 5 estaciones", () => {
    for (const nivel of NIVELES) {
      const sesion = generar(nivel, 5);
      expect(sesion.blocks.length).toBeGreaterThanOrEqual(3);
      expect(sesion.blocks.length).toBeLessThanOrEqual(5);
    }
  });

  it("los tres niveles generan estaciones distintas entre sí", () => {
    const [principiante, intermedio, avanzado] = NIVELES.map((nivel) => generar(nivel, 5));
    const titulos = (s: ReturnType<typeof generar>) => s.blocks.map((b) => b.title).join("|");

    expect(titulos(principiante!)).not.toBe(titulos(intermedio!));
    expect(titulos(intermedio!)).not.toBe(titulos(avanzado!));
    expect(titulos(principiante!)).not.toBe(titulos(avanzado!));
  });

  it("el foco declarado también distingue el nivel", () => {
    const focos = new Set(NIVELES.map((nivel) => generar(nivel, 5).focus));
    expect(focos.size).toBe(3);
  });
});

describe("GOLF.sesion — minutos", () => {
  it("la suma de minutos de las estaciones nunca pasa los minutos del bloque", () => {
    const minutosAProbar = [90, 60, 45, 30, 120, 20];
    for (const nivel of NIVELES) {
      for (const minutes of minutosAProbar) {
        const sesion = generar(nivel, 3, minutes);
        const sumaBloques = sesion.blocks.reduce((suma, b) => suma + (b.carga ?? 0), 0);
        expect(sumaBloques).toBeLessThanOrEqual(minutes);
        // `sesion.minutes` nunca inventa tiempo que no llegó del bloque: es el
        // real de la sesión (a veces menor, por el techo de sostenimiento de
        // cada nivel — ver BASE_MINUTOS en golf.ts), nunca mayor.
        expect(sesion.minutes).toBeLessThanOrEqual(minutes);
      }
    }
  });

  it("con el default de golf (90 min) también se respeta el tope", () => {
    for (const nivel of NIVELES) {
      const sesion = generar(nivel, 8, 90);
      const sumaBloques = sesion.blocks.reduce((suma, b) => suma + (b.carga ?? 0), 0);
      expect(sumaBloques).toBeLessThanOrEqual(90);
    }
  });
});

describe("GOLF.sesion — juego corto y putting (regla del 40% aproximada)", () => {
  it("siempre hay al menos una estación de putting o juego corto", () => {
    for (const nivel of NIVELES) {
      const sesion = generar(nivel, 5);
      const tienePutting = sesion.blocks.some((b) => /putt/i.test(b.title) || /putt/i.test(b.detail));
      expect(tienePutting).toBe(true);
    }
  });

  it("el putting/juego corto se lleva una porción real del tiempo, no un relleno", () => {
    for (const nivel of NIVELES) {
      const sesion = generar(nivel, 5, 90);
      const minutosPutting = sesion.blocks
        .filter((b) => /putt/i.test(b.title))
        .reduce((suma, b) => suma + (b.carga ?? 0), 0);

      // ~40% es la cifra que sustenta el generador (Broadie, strokes gained);
      // se deja margen (≥ 25%) porque el reparto real varía por nivel y por
      // redondeo de minutos, pero nunca puede quedarse en un bloque testigo.
      expect(minutosPutting).toBeGreaterThanOrEqual(sesion.minutes * 0.25);
    }
  });
});

describe("GOLF.sesion — variación semanal", () => {
  it("la misma disciplina y nivel varía a lo largo de varias semanas", () => {
    // Se revisa un rango de semanas en vez de un único par: con pools de
    // contenido cortos, dos semanas puntuales pueden coincidir por
    // coincidencia de módulo — lo que importa es que la sesión NO sea
    // siempre idéntica semana tras semana, no que cada par difiera.
    for (const nivel of NIVELES) {
      const detalles = Array.from({ length: 10 }, (_, i) => {
        const sesion = generar(nivel, i + 1);
        return sesion.blocks.map((b) => `${b.detail}`).join("|");
      });
      expect(new Set(detalles).size).toBeGreaterThan(1);
    }
  });

  it("una semana de descarga trae menos repeticiones, con las mismas estaciones", () => {
    // isoWeek % 4 === 0 es la semana de descarga (ver factorDeSemana en tipos.ts).
    const normal = generar("AVANZADO", 3, 90);
    const descarga = generar("AVANZADO", 4, 90);

    expect(normal.deload).toBe(false);
    expect(descarga.deload).toBe(true);
    expect(descarga.blocks.map((b) => b.title)).toEqual(normal.blocks.map((b) => b.title));
  });
});

describe("registro de disciplinas — golf conectado al planificador", () => {
  it("GOLF aparece en las disciplinas prescribibles", () => {
    expect(DISCIPLINAS_PRESCRIBIBLES.some((p) => p.discipline === "GOLF")).toBe(true);
  });

  it("prescribirSesion(GOLF) devuelve una sesión en vez de null", () => {
    const sesion = prescribirSesion({
      discipline: "GOLF",
      nivel: "INTERMEDIO",
      isoWeek: 6,
      ordinal: 1,
      minutes: 90,
      objetivo: "SALUD",
    });

    expect(sesion).not.toBeNull();
    expect(sesion?.discipline).toBe("GOLF");
    expect(sesion?.unidad).toBe("min");
  });
});
