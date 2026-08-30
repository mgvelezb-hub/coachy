import { describe, expect, it } from "vitest";

import { planDisciplines } from "@/lib/training/disciplines";
import { prescribirSesion, DISCIPLINAS_PRESCRIBIBLES } from "@/lib/training/disciplinas";
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
    niveles: { NATACION: "INTERMEDIO" },
    objetivo: "RECOMPOSICION",
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

  it("las disciplinas con prescriptor traen plan; las demás reservan el día", () => {
    const { sessions } = plan({
      loads: [
        { discipline: "NATACION", sessionsPerWeek: 1 },
        { discipline: "SQUASH", sessionsPerWeek: 1 },
        { discipline: "OTRO", sessionsPerWeek: 1 },
      ],
      gym: gymWeek([["LUN", "PIERNA_CUADRICEPS"]]),
    });

    expect(sessions.find((session) => session.discipline === "NATACION")?.sesion).not.toBeNull();
    expect(sessions.find((session) => session.discipline === "SQUASH")?.sesion).not.toBeNull();
    // `OTRO` es la cubeta de lo que se registra pero no se planea.
    expect(sessions.find((session) => session.discipline === "OTRO")?.sesion).toBeNull();
  });

  it("una disciplina sin sesiones no ocupa ningún día", () => {
    const { sessions } = plan({
      loads: [{ discipline: "NATACION", sessionsPerWeek: 0 }],
      gym: gymWeek([["LUN", "PIERNA_CUADRICEPS"]]),
    });
    expect(sessions).toEqual([]);
  });
});

describe("prescripción por disciplina", () => {
  const base = { isoWeek: 2, ordinal: 1, minutes: 45, objetivo: "RECOMPOSICION" as const };

  it("cada disciplina del registro prescribe en sus tres niveles", () => {
    for (const prescriptor of DISCIPLINAS_PRESCRIBIBLES) {
      for (const { nivel } of prescriptor.niveles) {
        const sesion = prescribirSesion({ ...base, discipline: prescriptor.discipline, nivel });

        expect(sesion, `${prescriptor.nombre} ${nivel}`).not.toBeNull();
        expect(sesion!.blocks.length, `${prescriptor.nombre} ${nivel}`).toBeGreaterThan(2);
        expect(sesion!.unidad, `${prescriptor.nombre} ${nivel}`).toBeTruthy();
      }
    }
  });

  it("la carga total es la suma de los bloques que sí se miden", () => {
    for (const prescriptor of DISCIPLINAS_PRESCRIBIBLES) {
      const sesion = prescribirSesion({
        ...base,
        discipline: prescriptor.discipline,
        nivel: "INTERMEDIO",
      })!;
      const suma = sesion.blocks.reduce((total, bloque) => total + (bloque.carga ?? 0), 0);
      expect(sesion.cargaTotal, prescriptor.nombre).toBe(suma);
    }
  });

  it("quien empieza siempre carga menos que quien va avanzado", () => {
    for (const prescriptor of DISCIPLINAS_PRESCRIBIBLES) {
      const principiante = prescribirSesion({
        ...base,
        discipline: prescriptor.discipline,
        nivel: "PRINCIPIANTE",
      })!;
      const avanzado = prescribirSesion({
        ...base,
        discipline: prescriptor.discipline,
        nivel: "AVANZADO",
      })!;

      expect(principiante.cargaTotal, prescriptor.nombre).toBeLessThan(avanzado.cargaTotal);
    }
  });

  it("el objetivo mueve el volumen: perder grasa pide más que ganar músculo", () => {
    for (const prescriptor of DISCIPLINAS_PRESCRIBIBLES) {
      const grasa = prescribirSesion({
        ...base,
        discipline: prescriptor.discipline,
        nivel: "INTERMEDIO",
        objetivo: "PERDIDA_GRASA",
      })!;
      const musculo = prescribirSesion({
        ...base,
        discipline: prescriptor.discipline,
        nivel: "INTERMEDIO",
        objetivo: "GANANCIA_MUSCULO",
      })!;

      expect(grasa.cargaTotal, prescriptor.nombre).toBeGreaterThanOrEqual(musculo.cargaTotal);
      expect(musculo.notes.join(" "), prescriptor.nombre).toContain("compite con la fuerza");
    }
  });

  it("descarga cada cuarta semana, en todas", () => {
    for (const prescriptor of DISCIPLINAS_PRESCRIBIBLES) {
      const normal = prescribirSesion({ ...base, discipline: prescriptor.discipline, nivel: "INTERMEDIO", isoWeek: 3 })!;
      const descarga = prescribirSesion({ ...base, discipline: prescriptor.discipline, nivel: "INTERMEDIO", isoWeek: 4 })!;

      expect(descarga.deload, prescriptor.nombre).toBe(true);
      expect(descarga.cargaTotal, prescriptor.nombre).toBeLessThanOrEqual(normal.cargaTotal);
    }
  });

  it("box no prescribe sparring en ningún nivel", () => {
    for (const nivel of ["PRINCIPIANTE", "INTERMEDIO", "AVANZADO"] as const) {
      const sesion = prescribirSesion({ ...base, discipline: "BOX", nivel })!;
      const texto = `${sesion.blocks.map((b) => `${b.title} ${b.detail} ${b.note}`).join(" ")} ${sesion.notes.join(" ")}`;

      expect(texto.toLowerCase(), nivel).not.toMatch(/haz sparring|hacer sparring|guanteo con/);
      expect(sesion.notes.join(" "), nivel).toContain("no hay sparring");
    }
  });

  it("CrossFit no manda olímpicos a un principiante", () => {
    const sesion = prescribirSesion({ ...base, discipline: "CROSSFIT", nivel: "PRINCIPIANTE" })!;
    const texto = sesion.blocks.map((bloque) => `${bloque.detail} ${bloque.note}`).join(" ").toLowerCase();

    expect(texto).not.toMatch(/arranque de|envión de|snatch|clean and jerk/);
    expect(sesion.notes.join(" ")).toContain("no se prescriben desde una app");
  });

  it("es determinista: misma entrada, misma sesión", () => {
    for (const prescriptor of DISCIPLINAS_PRESCRIBIBLES) {
      const a = prescribirSesion({ ...base, discipline: prescriptor.discipline, nivel: "AVANZADO" });
      const b = prescribirSesion({ ...base, discipline: prescriptor.discipline, nivel: "AVANZADO" });
      expect(a, prescriptor.nombre).toEqual(b);
    }
  });
});
