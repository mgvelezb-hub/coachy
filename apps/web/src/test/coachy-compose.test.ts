import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import { ComposeError, composeReply, enforceEngineNumbers, replyToText } from "@/lib/coachy/compose";
import type { CoachyReply, ComposeInput, FewShotExample } from "@/lib/coachy/types";

/**
 * `composeReply` contra un cliente falso: sin red, sin llave, sin costo.
 *
 * Lo que se prueba no es que el modelo escriba bonito — eso lo revisa un humano
 * con la rúbrica de `eval/README.md` — sino el contrato: sale la estructura
 * completa, y **los números del motor no se pueden mover**.
 */

const TARGETS = { kcal: 1700, proteinG: 130, fatG: 45, carbG: 210, fiberG: 30 };

function input(overrides: Partial<ComposeInput> = {}): ComposeInput {
  return {
    athleteName: "Atleta",
    weekLabel: "23 de agosto de 2026",
    phase: "BASE",
    previousPhase: "BASE",
    targets: TARGETS,
    category: "HOLD",
    rules: [{ id: "R8", nombre: "PROGRESO", explicacion: "La cintura bajó 0.5 cm." }],
    engineExplanation: "Hay progreso: se mantiene la fase.",
    signals: {
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
    },
    vision: null,
    questions: [
      { id: "progreso-comida", signal: "progreso", text: "¿Cómo sentiste la comida?" },
    ],
    menuRefresh: false,
    electrolyteProtocol: false,
    injuryTrainingProtocol: false,
    simplifyMenu: false,
    ...overrides,
  };
}

const GOOD_REPLY: CoachyReply = {
  celebracion: "Bajaste medio centímetro de cintura y subiste cargas.",
  preguntas: ["¿Cómo sentiste la comida esta semana?"],
  comparacion: "Contra la semana pasada la cintura va de 89.5 a 89.",
  decision_texto: "Seguimos igual: 1700 kcal, 130 g de proteína.",
  meta: "Esta semana otro centímetro y agua a tope.",
  cierre: "Vamos con todo.",
};

/** Cliente falso: devuelve el tool_use que le pidamos. */
function fakeClient(
  reply: unknown,
  extra: Partial<{ stop_reason: string; content: unknown[] }> = {},
): { client: Anthropic; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn().mockResolvedValue({
    stop_reason: extra.stop_reason ?? "tool_use",
    content: extra.content ?? [
      { type: "tool_use", id: "toolu_1", name: "responder_al_checkin", input: reply },
    ],
  });

  return { client: { messages: { create } } as unknown as Anthropic, create };
}

describe("composeReply", () => {
  it("devuelve los seis campos de la metodología", async () => {
    const { client } = fakeClient(GOOD_REPLY);

    const reply = await composeReply(input(), { client });

    expect(Object.keys(reply).sort()).toEqual(
      ["celebracion", "cierre", "comparacion", "decision_texto", "meta", "preguntas"].sort(),
    );
    expect(reply.preguntas).toEqual(["¿Cómo sentiste la comida esta semana?"]);
  });

  it("fuerza la salida estructurada con la herramienta", async () => {
    const { client, create } = fakeClient(GOOD_REPLY);

    await composeReply(input(), { client });

    const call = create.mock.calls[0]?.[0];
    expect(call.tool_choice).toEqual({ type: "tool", name: "responder_al_checkin" });
    expect(call.tools[0].name).toBe("responder_al_checkin");
    expect(call.tools[0].strict).toBe(true);
  });

  it("mete los números del motor en el contexto, no en la herramienta", async () => {
    const { client, create } = fakeClient(GOOD_REPLY);

    await composeReply(input(), { client });

    const call = create.mock.calls[0]?.[0];
    const userMessage = String(call.messages[0].content);
    expect(userMessage).toContain("1700 kcal");
    expect(userMessage).toContain("130 g de proteína");
    // La herramienta no tiene ningún campo numérico donde el modelo pueda
    // escribir kcal o macros propios.
    expect(Object.keys(call.tools[0].input_schema.properties)).not.toContain("kcal");
  });

  it("mete el few-shot en el system prompt y sustituye el nombre del atleta", async () => {
    const { client, create } = fakeClient(GOOD_REPLY);
    const examples: FewShotExample[] = [
      { id: "fs-1", contexto: { semana: 1 }, respuesta: "Vamos {{ATLETA}}, con todo." },
    ];

    await composeReply(input({ athleteName: "Sam" }), { client, examples });

    const system = String(create.mock.calls[0]?.[0].system[0].text);
    expect(system).toContain("Vamos Sam, con todo.");
    expect(system).not.toContain("{{ATLETA}}");
  });

  it("no deja pasar kcal inventadas: las reemplaza por el texto del motor", async () => {
    const { client } = fakeClient({
      ...GOOD_REPLY,
      decision_texto: "Te bajo a 1450 kcal para apretar tantito.",
    });

    const reply = await composeReply(input(), { client });

    expect(reply.decision_texto).not.toContain("1450");
    expect(reply.decision_texto).toContain("1700");
  });

  it("deja pasar los números que sí son del motor", async () => {
    const { client } = fakeClient({
      ...GOOD_REPLY,
      decision_texto: "Seguimos en 1700 kcal con 210 g de carbos y 45 g de grasa.",
    });

    const reply = await composeReply(input(), { client });

    expect(reply.decision_texto).toContain("1700");
    expect(reply.decision_texto).toContain("210");
  });

  it("deja pasar los números chicos: centímetros, series, litros", async () => {
    const { client } = fakeClient({
      ...GOOD_REPLY,
      decision_texto: "Misma comida, 4 comidas al día.",
      meta: "Bajemos 3 cm de cintura y 3 litros de agua.",
    });

    const reply = await composeReply(input(), { client });

    expect(reply.decision_texto).toContain("4 comidas");
    expect(reply.meta).toContain("3 cm");
  });

  it("corta en tres preguntas si el modelo se pasa", async () => {
    const { client } = fakeClient({
      ...GOOD_REPLY,
      preguntas: ["a?", "b?", "c?", "d?", "e?"],
    });

    const reply = await composeReply(input(), { client });

    expect(reply.preguntas.length).toBe(3);
  });

  it("truena claro si el modelo no llama a la herramienta", async () => {
    const { client } = fakeClient(GOOD_REPLY, {
      content: [{ type: "text", text: "no quiero" }],
    });

    await expect(composeReply(input(), { client })).rejects.toBeInstanceOf(ComposeError);
  });

  it("truena claro si el modelo declina", async () => {
    const { client } = fakeClient(GOOD_REPLY, { stop_reason: "refusal", content: [] });

    await expect(composeReply(input(), { client })).rejects.toBeInstanceOf(ComposeError);
  });

  it("truena claro si la estructura llega incompleta", async () => {
    const { client } = fakeClient({ celebracion: "solo esto" });

    await expect(composeReply(input(), { client })).rejects.toBeInstanceOf(ComposeError);
  });
});

describe("enforceEngineNumbers", () => {
  it("es idempotente sobre una respuesta limpia", () => {
    const once = enforceEngineNumbers(GOOD_REPLY, input());
    const twice = enforceEngineNumbers(once, input());
    expect(twice).toEqual(once);
  });
});

describe("replyToText", () => {
  it("respeta el orden de la metodología y firma como Coachy", () => {
    const text = replyToText(GOOD_REPLY);
    const lines = text.split("\n\n");

    expect(lines[0]).toBe(GOOD_REPLY.celebracion);
    expect(lines[1]).toBe(GOOD_REPLY.preguntas[0]);
    expect(lines[2]).toBe(GOOD_REPLY.comparacion);
    expect(lines[3]).toBe(GOOD_REPLY.decision_texto);
    expect(lines[4]).toBe(GOOD_REPLY.meta);
    expect(text.endsWith("— Coachy")).toBe(true);
  });

  it("ignora los campos vacíos de una respuesta corregida a mano", () => {
    const corrected: CoachyReply = {
      celebracion: "Mensaje que escribió el coach de principio a fin.",
      preguntas: [],
      comparacion: "",
      decision_texto: "",
      meta: "",
      cierre: "",
    };

    expect(replyToText(corrected)).toBe(
      "Mensaje que escribió el coach de principio a fin.\n\n— Coachy",
    );
  });
});
