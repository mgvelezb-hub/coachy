import { describe, expect, it } from "vitest";

import {
  CYCLE_ESTIMATE_NOTE,
  DEFAULT_CYCLE_LENGTH,
  cycleNote,
  cycleNoteForProfile,
  cycleSettingsFromProfile,
  daysBetweenISO,
  estimateCyclePhase,
  isInconclusivePhase,
  parseCycleSettings,
  phaseForDay,
} from "@/lib/cycle";

/**
 * El ciclo se calcula con aritmética de calendario y nada más. Estas pruebas
 * cuidan las dos cosas que importan: que la fase caiga donde debe, y que el
 * módulo se niegue a estimar cuando no tiene con qué.
 */

const SETTINGS = {
  enabled: true,
  lastPeriodStart: "2026-08-03",
  avgLengthDays: DEFAULT_CYCLE_LENGTH,
};

describe("phaseForDay", () => {
  it("reparte el ciclo de 28 días en las cuatro fases", () => {
    expect(phaseForDay(1, 28)).toBe("MENSTRUACION");
    expect(phaseForDay(5, 28)).toBe("MENSTRUACION");
    expect(phaseForDay(6, 28)).toBe("FOLICULAR");
    expect(phaseForDay(12, 28)).toBe("FOLICULAR");
    expect(phaseForDay(13, 28)).toBe("OVULACION");
    expect(phaseForDay(14, 28)).toBe("OVULACION");
    expect(phaseForDay(15, 28)).toBe("OVULACION");
    expect(phaseForDay(16, 28)).toBe("LUTEA");
    expect(phaseForDay(28, 28)).toBe("LUTEA");
  });

  it("ancla la ovulación 14 días antes del siguiente periodo, no a la mitad", () => {
    // Ciclo de 35 días: la lútea sigue durando 14, así que ovula el día 21.
    expect(phaseForDay(21, 35)).toBe("OVULACION");
    expect(phaseForDay(19, 35)).toBe("FOLICULAR");
    expect(phaseForDay(23, 35)).toBe("LUTEA");
  });

  it("no deja que la ventana de ovulación pise el sangrado en ciclos cortos", () => {
    expect(phaseForDay(1, 21)).toBe("MENSTRUACION");
    expect(phaseForDay(4, 21)).toBe("MENSTRUACION");
    expect(phaseForDay(7, 21)).toBe("OVULACION");
    expect(phaseForDay(21, 21)).toBe("LUTEA");
  });

  it("clampa duraciones absurdas en vez de reventar", () => {
    expect(phaseForDay(1, 3)).toBe("MENSTRUACION");
    expect(phaseForDay(1, 900)).toBe("MENSTRUACION");
  });
});

describe("estimateCyclePhase", () => {
  it("cuenta desde el primer día del periodo, que es el día 1", () => {
    const estimate = estimateCyclePhase(SETTINGS, "2026-08-03");
    expect(estimate?.dayOfCycle).toBe(1);
    expect(estimate?.phase).toBe("MENSTRUACION");
    expect(estimate?.estimated).toBe(true);
  });

  it("proyecta al siguiente ciclo cuando no actualizó la fecha", () => {
    // 30 días después: día 3 del segundo ciclo.
    const estimate = estimateCyclePhase(SETTINGS, "2026-09-02");
    expect(estimate?.dayOfCycle).toBe(3);
    expect(estimate?.phase).toBe("MENSTRUACION");
    expect(estimate?.cyclesElapsed).toBe(1);
    expect(estimate?.stale).toBe(false);
  });

  it("marca como vieja la estimación que ya lleva dos ciclos sin refrescarse", () => {
    const estimate = estimateCyclePhase(SETTINGS, "2026-09-29");
    expect(estimate?.cyclesElapsed).toBe(2);
    expect(estimate?.stale).toBe(true);
  });

  it("no estima con el tracking apagado", () => {
    expect(estimateCyclePhase({ ...SETTINGS, enabled: false }, "2026-08-10")).toBeNull();
  });

  it("no estima sin fecha registrada", () => {
    expect(estimateCyclePhase({ ...SETTINGS, lastPeriodStart: null }, "2026-08-10")).toBeNull();
  });

  it("no estima hacia atrás de la fecha registrada", () => {
    expect(estimateCyclePhase(SETTINGS, "2026-08-01")).toBeNull();
  });

  it("deja de estimar cuando la fecha es demasiado vieja para significar algo", () => {
    expect(estimateCyclePhase(SETTINGS, "2027-08-03")).toBeNull();
  });
});

describe("semanas no concluyentes y nota del gimnasio", () => {
  it("lútea y menstruación son las fases que no concluyen", () => {
    expect(isInconclusivePhase("LUTEA")).toBe(true);
    expect(isInconclusivePhase("MENSTRUACION")).toBe(true);
    expect(isInconclusivePhase("FOLICULAR")).toBe(false);
    expect(isInconclusivePhase("OVULACION")).toBe(false);
    expect(isInconclusivePhase(null)).toBe(false);
  });

  it("la nota del gimnasio solo aparece en la semana del periodo", () => {
    expect(cycleNote("MENSTRUACION")).toContain("escuchar al cuerpo");
    expect(cycleNote("LUTEA")).toBeNull();
    expect(cycleNote(null)).toBeNull();
  });

  it("desde el perfil, la nota sale o no sale, pero la fase nunca se devuelve", () => {
    const profile = {
      cycleTrackingEnabled: true,
      cycleLastPeriodStart: new Date(2026, 7, 3),
      cycleAvgLength: 28,
    };

    expect(cycleSettingsFromProfile(profile).lastPeriodStart).toBe("2026-08-03");
    expect(cycleNoteForProfile(profile, "2026-08-04")).toContain("escuchar al cuerpo");
    // Día 10: folicular, ninguna nota.
    expect(cycleNoteForProfile(profile, "2026-08-12")).toBeNull();
    expect(
      cycleNoteForProfile({ ...profile, cycleTrackingEnabled: false }, "2026-08-04"),
    ).toBeNull();
  });

  it("el texto de la estimación dice explícitamente lo que no es", () => {
    expect(CYCLE_ESTIMATE_NOTE).toMatch(/no es un diagn[oó]stico/i);
    expect(CYCLE_ESTIMATE_NOTE).toMatch(/anticonceptivo/i);
  });
});

describe("daysBetweenISO", () => {
  it("cuenta días enteros sin arrastrar zona horaria", () => {
    expect(daysBetweenISO("2026-08-03", "2026-08-10")).toBe(7);
    expect(daysBetweenISO("2026-08-10", "2026-08-03")).toBe(-7);
  });

  it("devuelve null con una fecha que no es ISO", () => {
    expect(daysBetweenISO("03/08/2026", "2026-08-10")).toBeNull();
  });
});

describe("parseCycleSettings", () => {
  it("lee el opt-in del formulario", () => {
    const parsed = parseCycleSettings({
      cycleTrackingEnabled: "on",
      cycleLastPeriodStart: "2026-08-03",
      cycleAvgLength: "30",
    });
    expect(parsed).toEqual({
      cycleTrackingEnabled: true,
      cycleLastPeriodStart: "2026-08-03",
      cycleAvgLength: 30,
    });
  });

  it("acepta el bloque vacío: el ciclo es opcional", () => {
    const parsed = parseCycleSettings({});
    expect(parsed?.cycleTrackingEnabled).toBe(false);
    expect(parsed?.cycleLastPeriodStart).toBeNull();
    expect(parsed?.cycleAvgLength).toBe(DEFAULT_CYCLE_LENGTH);
  });

  it("rechaza una duración fuera de la banda fisiológica", () => {
    expect(parseCycleSettings({ cycleAvgLength: "3" })).toBeNull();
    expect(parseCycleSettings({ cycleAvgLength: "120" })).toBeNull();
  });
});
