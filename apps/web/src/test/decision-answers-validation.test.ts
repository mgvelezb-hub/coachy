import { describe, expect, it } from "vitest";

import { decisionAnswersSchema } from "@/lib/validation/decision-answers";

function validPayload() {
  return {
    decisionId: "8f6f2c2e-1111-4a2a-9c3d-000000000001",
    respuestas: [{ pregunta: "¿Cómo dormiste esta semana?", respuesta: "Mejor que la anterior" }],
  };
}

describe("decisionAnswersSchema", () => {
  it("acepta un payload válido con una respuesta", () => {
    expect(decisionAnswersSchema.safeParse(validPayload()).success).toBe(true);
  });

  it("acepta hasta 10 respuestas", () => {
    const payload = {
      decisionId: "d1",
      respuestas: Array.from({ length: 10 }, (_, index) => ({
        pregunta: `Pregunta ${index}`,
        respuesta: `Respuesta ${index}`,
      })),
    };
    expect(decisionAnswersSchema.safeParse(payload).success).toBe(true);
  });

  it("permite una respuesta vacía (se filtra en el endpoint, no aquí)", () => {
    const payload = {
      decisionId: "d1",
      respuestas: [{ pregunta: "¿Algo que contar?", respuesta: "" }],
    };
    const result = decisionAnswersSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.respuestas[0]?.respuesta).toBe("");
  });

  it("rechaza un arreglo de respuestas vacío", () => {
    const payload = { decisionId: "d1", respuestas: [] };
    expect(decisionAnswersSchema.safeParse(payload).success).toBe(false);
  });

  it("rechaza más de 10 respuestas", () => {
    const payload = {
      decisionId: "d1",
      respuestas: Array.from({ length: 11 }, (_, index) => ({
        pregunta: `Pregunta ${index}`,
        respuesta: `Respuesta ${index}`,
      })),
    };
    expect(decisionAnswersSchema.safeParse(payload).success).toBe(false);
  });

  it("rechaza una respuesta de más de 2000 caracteres", () => {
    const payload = {
      decisionId: "d1",
      respuestas: [{ pregunta: "¿Cómo vas?", respuesta: "a".repeat(2001) }],
    };
    expect(decisionAnswersSchema.safeParse(payload).success).toBe(false);
  });

  it("rechaza una pregunta de más de 2000 caracteres", () => {
    const payload = {
      decisionId: "d1",
      respuestas: [{ pregunta: "a".repeat(2001), respuesta: "ok" }],
    };
    expect(decisionAnswersSchema.safeParse(payload).success).toBe(false);
  });

  it("rechaza una pregunta vacía: siempre debe traer texto", () => {
    const payload = { decisionId: "d1", respuestas: [{ pregunta: "", respuesta: "ok" }] };
    expect(decisionAnswersSchema.safeParse(payload).success).toBe(false);
  });

  it("rechaza sin decisionId", () => {
    const payload = { respuestas: [{ pregunta: "p", respuesta: "r" }] };
    expect(decisionAnswersSchema.safeParse(payload).success).toBe(false);
  });

  it("recorta espacios de pregunta y respuesta", () => {
    const payload = {
      decisionId: "d1",
      respuestas: [{ pregunta: "  ¿Todo bien?  ", respuesta: "  Sí  " }],
    };
    const result = decisionAnswersSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.respuestas[0]?.pregunta).toBe("¿Todo bien?");
      expect(result.data.respuestas[0]?.respuesta).toBe("Sí");
    }
  });
});
