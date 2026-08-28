import { describe, expect, it } from "vitest";

import {
  MAX_QUESTIONS,
  pickQuestions,
  questionBankIds,
  questionById,
  type QuestionContext,
} from "@/lib/coachy/questions";
import type { WeekSignals } from "@/lib/coachy/types";

function signals(overrides: Partial<WeekSignals> = {}): WeekSignals {
  return {
    fecha: "2026-08-23",
    cinturaCm: 89,
    cinturaDeltaCm: -0.5,
    cinturaDeltaDesdeInicioCm: -6.5,
    pesoKg: 75,
    pesoDeltaKg: 0,
    inflamacion: 2,
    energia: 4,
    hambre: 2,
    saciedad: 4,
    sueno: 4,
    fuerzaRpe: 8,
    fuerzaTendencia: "sube",
    cumplimientoDieta: 95,
    cumplimientoEntreno: 100,
    sintomas: [],
    faseCiclo: null,
    comentario: null,
    semanasEnFase: 2,
    semanasSinProgreso: 0,
    entrenamiento: { planeadas: 5, completadas: 4, recortadas: 1 },
    ...overrides,
  };
}

function context(overrides: Partial<QuestionContext> = {}): QuestionContext {
  return {
    signals: signals(),
    category: "HOLD",
    inconclusiveWeek: false,
    recomposition: false,
    photosDisagreeWithFeeling: false,
    ...overrides,
  };
}

describe("banco de preguntas", () => {
  it("nunca hace más de tres preguntas, ni con todas las señales prendidas", () => {
    const questions = pickQuestions(
      context({
        signals: signals({
          sintomas: ["calambres", "mareo", "dolor_pie"],
          sueno: 1,
          hambre: 5,
          saciedad: 1,
          inflamacion: 5,
          cumplimientoDieta: 40,
          cumplimientoEntreno: 20,
          semanasSinProgreso: 4,
          entrenamiento: { planeadas: 5, completadas: 4, recortadas: 1 },
        }),
        recomposition: true,
        photosDisagreeWithFeeling: true,
        inconclusiveWeek: true,
      }),
    );

    expect(questions.length).toBe(MAX_QUESTIONS);
  });

  it("siempre hace al menos una pregunta, aunque la semana sea perfecta", () => {
    const questions = pickQuestions(context());

    expect(questions.length).toBeGreaterThan(0);
    expect(questions.length).toBeLessThanOrEqual(MAX_QUESTIONS);
  });

  it("prioriza los síntomas sobre el progreso", () => {
    const questions = pickQuestions(
      context({ signals: signals({ sintomas: ["calambres"] }) }),
    );

    expect(questions[0]?.id).toBe("sintoma-calambres");
    expect(questions[0]?.signal).toBe("sintomas");
  });

  it("pregunta por la ropa cuando la cintura baja y el peso no", () => {
    const questions = pickQuestions(context({ recomposition: true }));

    expect(questions.map((question) => question.id)).toContain("recomposicion-ropa");
  });

  it("pregunta por el cumplimiento real cuando la adherencia se cae", () => {
    const questions = pickQuestions(
      context({ signals: signals({ cumplimientoDieta: 60 }) }),
    );

    expect(questions.map((question) => question.id)).toContain("adherencia-real");
  });

  it("no repite ninguna pregunta de la semana pasada", () => {
    // Contexto con más de tres preguntas elegibles: si solo hubiera tres, el
    // banco preferiría repetir antes que quedarse callado (ver caso de abajo).
    const ctx = context({
      signals: signals({ sintomas: ["calambres"], sueno: 2, hambre: 5, cumplimientoDieta: 60 }),
    });

    const first = pickQuestions(ctx);
    const second = pickQuestions(ctx, first.map((question) => question.id));

    const repeated = second.filter((question) =>
      first.some((previous) => previous.id === question.id),
    );

    expect(repeated).toEqual([]);
  });

  it("prefiere repetir antes que quedarse callado si el banco se agota", () => {
    const ctx = context({ signals: signals({ sintomas: ["calambres"] }) });
    const everything = questionBankIds();

    const questions = pickQuestions(ctx, everything);

    expect(questions.length).toBeGreaterThan(0);
  });

  it("no repite dos semanas seguidas ni encadenando tres semanas", () => {
    const ctx = context({
      signals: signals({ sintomas: ["calambres"], sueno: 2, hambre: 5 }),
    });

    const week1 = pickQuestions(ctx);
    const week2 = pickQuestions(ctx, week1.map((question) => question.id));
    const week3 = pickQuestions(ctx, week2.map((question) => question.id));

    // La semana 3 puede volver a lo de la 1 (ya pasaron dos semanas), pero
    // nunca puede coincidir con la 2.
    const collision = week3.filter((question) =>
      week2.some((previous) => previous.id === question.id),
    );
    expect(collision).toEqual([]);
  });

  it("reconstruye una pregunta guardada por su id", () => {
    expect(questionById("progreso-comida")?.text).toContain("comida");
    expect(questionById("no-existe")).toBeNull();
  });

  it("no tiene ids duplicados", () => {
    const ids = questionBankIds();
    expect(new Set(ids).size).toBe(ids.length);
  });
});
