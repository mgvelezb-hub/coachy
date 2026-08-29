import { describe, expect, it } from "vitest";

import { planDisciplines } from "@/lib/training/disciplines";
import { swimSessionFor } from "@/lib/training/swim";
import type { DayKind } from "@/lib/training/types";
import type { WeekDay } from "@/lib/training/split";

/**
 * El modelo de convivencia entre disciplinas (Fase 7).
 *
 * Lo que se prueba no son los números —cuántos metros, cuántos puntos de
 * puntuación—, sino las cuatro reglas: el presupuesto no se estira, la
 * primaria arma el esqueleto, el alto impacto no va la víspera de pierna, y
 * el día compartido recorta el gimnasio.
 */

/** Lunes 2026-01-05 = semana ISO 2. */
const MONDAY = new Date("2026-01-05T12:00:00");

/** Semana de pesas típica de 5 días con el split del coach. */
function gymWeek(entries: Array<[WeekDay, DayKind]>): Map<WeekDay, DayKind> {
  return new Map(entries);
}

function plan(input: {
  loads: Array<{ discipline: Parameters<typeof planDisciplines>[0]["otherDisciplines"][number]["discipline"]; sessionsPerWeek: number }>;
  gym: Map<WeekDay, DayKind>;
  isoWeek?: number;
}) {
  return planDisciplines({
    weekStart: MONDAY,
    otherDisciplines: input.loads,
    gymByDay: input.gym,
    swimLevel: "INTERMEDIO",
    isoWeek: input.isoWeek ?? 2,
  });
}

describe("reparto de disciplinas en la semana", () => {
  it("coloca las sesiones en los huecos que deja el gimnasio", () => {
    const { sessions } = plan({
      loads: [{ discipline: "NATACION", sessionsPerWeek: 2 }],
      gym: gymWeek([
        ["LUN", "PIERNA_CUADRICEPS"],
        ["MAR", "HOMBRO"],
        ["MIE", "PECHO_ESPALDA"],
      ]),
    });

    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => !session.sharesDayWithGym)).toBe(true);
  });

  it("no pone dos disciplinas el mismo día", () => {
    const { sessions } = plan({
      loads: [
        { discipline: "NATACION", sessionsPerWeek: 2 },
        { discipline: "BOX", sessionsPerWeek: 2 },
      ],
      gym: gymWeek([["LUN", "PIERNA_CUADRICEPS"]]),
    });

    const fechas = sessions.map((session) => session.date);
    expect(new Set(fechas).size).toBe(fechas.length);
  });

  it("el alto impacto no cae la víspera de pierna", () => {
    const { sessions } = plan({
      loads: [{ discipline: "BOX", sessionsPerWeek: 1 }],
      gym: gymWeek([
        ["LUN", "HOMBRO"],
        ["MIE", "PIERNA_CUADRICEPS"],
        ["VIE", "PECHO_ESPALDA"],
      ]),
    });

    // El martes es la víspera del miércoles de pierna: no debe elegirse.
    expect(sessions[0]!.weekday).not.toBe("MAR");
  });

  it("la natación prefiere el día después de pierna", () => {
    const { sessions } = plan({
      loads: [{ discipline: "NATACION", sessionsPerWeek: 1 }],
      gym: gymWeek([
        ["LUN", "PIERNA_CUADRICEPS"],
        ["MIE", "HOMBRO"],
        ["JUE", "PECHO_ESPALDA"],
      ]),
    });

    expect(sessions[0]!.weekday).toBe("MAR");
    expect(sessions[0]!.note).toContain("después de pierna");
  });

  it("cuando no hay huecos comparte día, y ese día de gimnasio se recorta", () => {
    const { sessions, crowdedDates } = plan({
      loads: [{ discipline: "NATACION", sessionsPerWeek: 1 }],
      gym: gymWeek([
        ["LUN", "PIERNA_CUADRICEPS"],
        ["MAR", "HOMBRO"],
        ["MIE", "PECHO_ESPALDA"],
        ["JUE", "PIERNA_FEMORAL"],
        ["VIE", "BRAZO"],
        ["SAB", "PIERNA_GLUTEO"],
        ["DOM", "TORSO"],
      ]),
    });

    expect(sessions[0]!.sharesDayWithGym).toBe(true);
    expect(crowdedDates).toEqual([sessions[0]!.date]);
    expect(sessions[0]!.note).toContain("un ejercicio menos");
  });

  it("solo la natación trae plan; las demás reservan el día", () => {
    const { sessions } = plan({
      loads: [
        { discipline: "NATACION", sessionsPerWeek: 1 },
        { discipline: "SQUASH", sessionsPerWeek: 1 },
      ],
      gym: gymWeek([["LUN", "PIERNA_CUADRICEPS"]]),
    });

    const natacion = sessions.find((session) => session.discipline === "NATACION");
    const squash = sessions.find((session) => session.discipline === "SQUASH");

    expect(natacion?.swim).not.toBeNull();
    expect(squash?.swim).toBeNull();
  });

  it("una disciplina sin sesiones no ocupa ningún día", () => {
    const { sessions } = plan({
      loads: [{ discipline: "NATACION", sessionsPerWeek: 0 }],
      gym: gymWeek([["LUN", "PIERNA_CUADRICEPS"]]),
    });
    expect(sessions).toEqual([]);
  });
});

describe("prescripción de natación", () => {
  it("la sesión suma sus bloques y siempre trae técnica", () => {
    const session = swimSessionFor({ level: "INTERMEDIO", isoWeek: 2, ordinal: 1, minutes: 45 });

    expect(session.totalMeters).toBe(
      session.blocks.reduce((sum, block) => sum + block.meters, 0),
    );
    expect(session.blocks.map((block) => block.title)).toContain("Técnica");
  });

  it("sube el volumen dentro del ciclo y descarga cada cuarta semana", () => {
    const semana1 = swimSessionFor({ level: "INTERMEDIO", isoWeek: 1, ordinal: 1, minutes: 45 });
    const semana3 = swimSessionFor({ level: "INTERMEDIO", isoWeek: 3, ordinal: 1, minutes: 45 });
    const descarga = swimSessionFor({ level: "INTERMEDIO", isoWeek: 4, ordinal: 1, minutes: 45 });

    expect(semana3.totalMeters).toBeGreaterThan(semana1.totalMeters);
    expect(descarga.totalMeters).toBeLessThan(semana1.totalMeters);
    expect(descarga.deload).toBe(true);
  });

  it("quien empieza nada menos y descansa más", () => {
    const principiante = swimSessionFor({
      level: "PRINCIPIANTE",
      isoWeek: 2,
      ordinal: 1,
      minutes: 45,
    });
    const avanzado = swimSessionFor({ level: "AVANZADO", isoWeek: 2, ordinal: 1, minutes: 45 });

    expect(principiante.totalMeters).toBeLessThan(avanzado.totalMeters);

    const descansoPrincipiante = principiante.blocks.find((b) => b.restSeconds !== null)!.restSeconds!;
    const descansoAvanzado = avanzado.blocks.find((b) => b.restSeconds !== null)!.restSeconds!;
    expect(descansoPrincipiante).toBeGreaterThan(descansoAvanzado);
  });

  it("con dos sesiones a la semana no repite el mismo estímulo", () => {
    const primera = swimSessionFor({ level: "INTERMEDIO", isoWeek: 2, ordinal: 1, minutes: 45 });
    const segunda = swimSessionFor({ level: "INTERMEDIO", isoWeek: 2, ordinal: 2, minutes: 45 });

    expect(primera.focus).not.toBe(segunda.focus);
  });

  it("a quien empieza no se le prescriben series fuertes", () => {
    const primera = swimSessionFor({ level: "PRINCIPIANTE", isoWeek: 2, ordinal: 1, minutes: 45 });
    const segunda = swimSessionFor({ level: "PRINCIPIANTE", isoWeek: 2, ordinal: 2, minutes: 45 });

    expect(primera.focus).toBe("Técnica y familiaridad");
    expect(segunda.focus).toBe("Técnica y familiaridad");
    expect(segunda.notes.some((note) => note.includes("tabla"))).toBe(true);
  });

  it("es determinista: misma entrada, misma sesión", () => {
    const a = swimSessionFor({ level: "AVANZADO", isoWeek: 7, ordinal: 1, minutes: 45 });
    const b = swimSessionFor({ level: "AVANZADO", isoWeek: 7, ordinal: 1, minutes: 45 });
    expect(a).toEqual(b);
  });
});
