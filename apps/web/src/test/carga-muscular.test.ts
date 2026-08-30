import { describe, expect, it } from "vitest";

import {
  CARGA_POR_DISCIPLINA,
  gruposFatigados,
  lecturaDeSustitucion,
} from "@/lib/training/carga-muscular";
import { DISCIPLINES } from "@/lib/training/types";

/**
 * Qué carga cada disciplina.
 *
 * La pregunta que originó esto: "si nado, ¿puedo mover el trabajo de pierna a
 * la alberca?". Lo que se cuida en estas pruebas es que la respuesta no se
 * vuelva un "sí" cómodo: nadar no reemplaza un jalón pesado, y el mapa existe
 * para quitar volumen donde de verdad sobra, no para saltarse días.
 */

describe("mapa de carga", () => {
  it("cubre todas las disciplinas", () => {
    for (const disciplina of DISCIPLINES) {
      expect(CARGA_POR_DISCIPLINA[disciplina], disciplina).toBeDefined();
    }
  });

  it("pesas no declara carga: su día lo decide el split", () => {
    expect(gruposFatigados("PESAS")).toEqual([]);
  });

  it("nadar deja la espalda y el hombro trabajados, no la pierna", () => {
    const fatigados = gruposFatigados("NATACION");
    expect(fatigados).toContain("ESPALDA");
    expect(fatigados).toContain("HOMBRO");
    expect(fatigados).not.toContain("PIERNA");
  });

  it("el squash sí deja la pierna trabajada", () => {
    expect(gruposFatigados("SQUASH")).toContain("PIERNA");
  });

  it("solo la carga fuerte cuenta como fatiga", () => {
    // El crol usa pecho, pero no lo carga: recortar pecho por haber nadado
    // sería recortar por una suposición.
    expect(CARGA_POR_DISCIPLINA.NATACION.PECHO).toBe(1);
    expect(gruposFatigados("NATACION")).not.toContain("PECHO");
  });
});

describe("mover trabajo a otra disciplina", () => {
  it("no deja mover un grupo que esa disciplina no toca", () => {
    const lectura = lecturaDeSustitucion("NATACION", "PIERNA");
    expect(lectura.puede).toBe(false);
    expect(lectura.texto).toContain("dejar de entrenarlo");
  });

  it("tampoco cuando solo lo acompaña", () => {
    const lectura = lecturaDeSustitucion("NATACION", "PECHO");
    expect(lectura.puede).toBe(false);
    expect(lectura.texto).toContain("acompañar");
  });

  it("cuando sí lo carga, lo dice con su letra chica", () => {
    const lectura = lecturaDeSustitucion("NATACION", "ESPALDA");
    expect(lectura.puede).toBe(true);
    // La parte que no se puede omitir: no es el mismo estímulo.
    expect(lectura.texto).toContain("No es lo mismo");
    expect(lectura.texto).toContain("sostener");
  });
});
