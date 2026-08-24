import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG } from "@/lib/engine-config";
import { findOutOfConfig, weeksInCurrentPhase } from "@/lib/observatory/data";
import {
  buildProposals,
  hydrationMentions,
  missingPhotoViews,
  stalledExercises,
} from "@/lib/observatory/proposals";
import { INCONCLUSIVE_LABEL, sanitizeForAdmin } from "@/lib/observatory/sanitize";
import { detectEscalations, type EscalationWeek } from "@/lib/observatory/signals";

/**
 * Escalamiento y propuestas. Todo determinista: la fecha de hoy entra como
 * parámetro y ninguna señal depende del reloj de la máquina.
 */

function week(
  date: string,
  overrides: Partial<EscalationWeek> = {},
): EscalationWeek {
  return {
    date,
    symptoms: [],
    dietCompliance: 90,
    trainingCompliance: 90,
    ...overrides,
  };
}

describe("detectEscalations", () => {
  it("escala un síntoma de seguridad repetido dos semanas", () => {
    const signals = detectEscalations({
      weeks: [
        week("2026-07-26"),
        week("2026-08-02", { symptoms: ["mareo"] }),
        week("2026-08-09", { symptoms: ["calambres"] }),
      ],
      today: "2026-08-10",
    });

    expect(signals.map((signal) => signal.id)).toContain("SINTOMA_SEGURIDAD_2_SEMANAS");
    const signal = signals.find((s) => s.id === "SINTOMA_SEGURIDAD_2_SEMANAS")!;
    expect(signal.severity).toBe("alta");
    expect(signal.since).toBe("2026-08-02");
  });

  it("no escala un síntoma de una sola semana", () => {
    const signals = detectEscalations({
      weeks: [week("2026-08-02"), week("2026-08-09", { symptoms: ["mareo"] })],
      today: "2026-08-10",
    });
    expect(signals.map((s) => s.id)).not.toContain("SINTOMA_SEGURIDAD_2_SEMANAS");
  });

  it("ignora síntomas que no son de seguridad", () => {
    const signals = detectEscalations({
      weeks: [
        week("2026-08-02", { symptoms: ["estrenimiento"] }),
        week("2026-08-09", { symptoms: ["inflamacion_abdominal"] }),
      ],
      today: "2026-08-10",
    });
    expect(signals).toHaveLength(0);
  });

  it("escala dos semanas de cumplimiento bajo, mirando el peor de los dos", () => {
    const signals = detectEscalations({
      weeks: [
        week("2026-08-02", { dietCompliance: 40, trainingCompliance: 95 }),
        week("2026-08-09", { dietCompliance: 90, trainingCompliance: 30 }),
      ],
      today: "2026-08-10",
    });
    expect(signals.map((s) => s.id)).toContain("CUMPLIMIENTO_BAJO_2_SEMANAS");
  });

  it("no escala si una de las dos semanas se cumplió", () => {
    const signals = detectEscalations({
      weeks: [
        week("2026-08-02", { dietCompliance: 40 }),
        week("2026-08-09", { dietCompliance: 85 }),
      ],
      today: "2026-08-10",
    });
    expect(signals.map((s) => s.id)).not.toContain("CUMPLIMIENTO_BAJO_2_SEMANAS");
  });

  it("escala a las tres semanas sin check-in, no a las dos", () => {
    const twoWeeks = detectEscalations({
      weeks: [week("2026-08-02")],
      today: "2026-08-16",
    });
    expect(twoWeeks.map((s) => s.id)).not.toContain("SIN_CHECKIN_3_SEMANAS");

    const threeWeeks = detectEscalations({
      weeks: [week("2026-08-02")],
      today: "2026-08-23",
    });
    expect(threeWeeks.map((s) => s.id)).toContain("SIN_CHECKIN_3_SEMANAS");
  });

  it("pasa por la señal de config fuera de rango tal como llega", () => {
    const signals = detectEscalations({
      weeks: [week("2026-08-09")],
      today: "2026-08-10",
      outOfConfig: { date: "2026-08-09", reason: "Propone 1100 kcal, por debajo del piso." },
    });
    const signal = signals.find((s) => s.id === "MOTOR_FUERA_DE_CONFIG")!;
    expect(signal.detail).toContain("1100 kcal");
    expect(signal.severity).toBe("media");
  });

  it("no inventa señales con un historial sano", () => {
    expect(
      detectEscalations({
        weeks: [week("2026-08-02"), week("2026-08-09")],
        today: "2026-08-10",
      }),
    ).toEqual([]);
  });

  it("sin ningún check-in no hay nada que escalar todavía", () => {
    expect(detectEscalations({ weeks: [], today: "2026-08-10" })).toEqual([]);
  });
});

describe("findOutOfConfig", () => {
  const base = {
    latest: { date: "2026-08-09", phase: "CUT", kcal: 1600 },
    weeksInPhase: 2,
    kcalFloorValue: 1300,
    config: DEFAULT_ENGINE_CONFIG,
  };

  it("no marca nada cuando la propuesta cabe en la config", () => {
    expect(findOutOfConfig(base)).toBeNull();
  });

  it("marca kcal por debajo del piso", () => {
    const finding = findOutOfConfig({ ...base, latest: { ...base.latest, kcal: 1200 } });
    expect(finding?.reason).toContain("1200 kcal");
    expect(finding?.reason).toContain("1300");
  });

  it("marca una fase que ya pasó su tope de semanas", () => {
    const finding = findOutOfConfig({ ...base, weeksInPhase: 9 });
    expect(finding?.reason).toContain("9 semanas");
  });

  it("sin decisión no hay nada que comparar", () => {
    expect(findOutOfConfig({ ...base, latest: null })).toBeNull();
  });
});

describe("weeksInCurrentPhase", () => {
  it("cuenta hacia atrás hasta el cambio de fase", () => {
    expect(weeksInCurrentPhase(["BASE", "BASE", "CUT", "CUT", "CUT"])).toBe(3);
    expect(weeksInCurrentPhase(["CUT"])).toBe(1);
    expect(weeksInCurrentPhase([])).toBe(0);
  });
});

describe("sanitizeForAdmin", () => {
  it("borra la fase del ciclo del texto que ve el admin", () => {
    const original =
      "Semana en fase lutea o menstruacion sin caida de cintura: la retencion distorsiona la medida.";
    const clean = sanitizeForAdmin(original);
    expect(clean).toContain(INCONCLUSIVE_LABEL);
    expect(clean.toLowerCase()).not.toMatch(/lutea|l[uú]tea|menstruaci/);
  });

  it("no deja la etiqueta repetida cuando había dos términos seguidos", () => {
    const clean = sanitizeForAdmin("Semana en fase lútea o menstruación, se mantiene el plan.");
    expect(clean).toBe(`Semana en ${INCONCLUSIVE_LABEL}, se mantiene el plan.`);
  });

  it("deja intacto un texto que no habla del ciclo", () => {
    const original = "Cintura estable dos semanas: se profundiza el déficit en carbohidratos.";
    expect(sanitizeForAdmin(original)).toBe(original);
  });

  it("tolera null y cadena vacía", () => {
    expect(sanitizeForAdmin(null)).toBe("");
    expect(sanitizeForAdmin("")).toBe("");
  });
});

describe("propuestas de mejora", () => {
  it("propone revisar un ejercicio que lleva tres sesiones sin subir carga", () => {
    const proposals = stalledExercises([
      { exerciseName: "Prensa", date: "2026-07-20", topWeightKg: 100 },
      { exerciseName: "Prensa", date: "2026-07-27", topWeightKg: 100 },
      { exerciseName: "Prensa", date: "2026-08-03", topWeightKg: 100 },
    ]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.title).toContain("Prensa");
  });

  it("no propone nada si en la ventana sí subió", () => {
    const proposals = stalledExercises([
      { exerciseName: "Prensa", date: "2026-07-20", topWeightKg: 100 },
      { exerciseName: "Prensa", date: "2026-07-27", topWeightKg: 100 },
      { exerciseName: "Prensa", date: "2026-08-03", topWeightKg: 105 },
    ]);
    expect(proposals).toEqual([]);
  });

  it("no propone nada con menos de tres sesiones registradas", () => {
    expect(
      stalledExercises([
        { exerciseName: "Prensa", date: "2026-07-27", topWeightKg: 100 },
        { exerciseName: "Prensa", date: "2026-08-03", topWeightKg: 100 },
      ]),
    ).toEqual([]);
  });

  it("señala la vista de foto que falta una y otra vez", () => {
    const proposals = missingPhotoViews([
      { date: "2026-07-19", views: ["FRENTE", "PERFIL"] },
      { date: "2026-07-26", views: ["FRENTE", "PERFIL"] },
      { date: "2026-08-02", views: ["FRENTE", "PERFIL", "ESPALDA"] },
      { date: "2026-08-09", views: ["FRENTE"] },
    ]);
    expect(proposals.map((proposal) => proposal.key)).toEqual(["ESPALDA"]);
  });

  it("no señala vistas con pocos check-ins de historia", () => {
    expect(missingPhotoViews([{ date: "2026-08-09", views: [] }])).toEqual([]);
  });

  it("retoma la hidratación solo si ella la mencionó", () => {
    expect(
      hydrationMentions([{ date: "2026-08-09", text: "Casi no tomé agua esta semana" }]),
    ).toHaveLength(1);
    expect(
      hydrationMentions([{ date: "2026-08-09", text: "Aguanté bien los entrenamientos" }]),
    ).toEqual([]);
  });

  it("junta las tres familias de propuestas", () => {
    const proposals = buildProposals({
      tops: [
        { exerciseName: "Prensa", date: "2026-07-20", topWeightKg: 100 },
        { exerciseName: "Prensa", date: "2026-07-27", topWeightKg: 100 },
        { exerciseName: "Prensa", date: "2026-08-03", topWeightKg: 100 },
      ],
      photoWeeks: [
        { date: "2026-07-19", views: ["FRENTE"] },
        { date: "2026-07-26", views: ["FRENTE"] },
        { date: "2026-08-02", views: ["FRENTE"] },
      ],
      comments: [{ date: "2026-08-02", text: "me costó hidratarme" }],
    });

    expect(new Set(proposals.map((proposal) => proposal.id))).toEqual(
      new Set([
        "EJERCICIO_SIN_PROGRESION",
        "VISTA_DE_FOTO_FALTANTE",
        "HIDRATACION_MENCIONADA",
      ]),
    );
  });
});
