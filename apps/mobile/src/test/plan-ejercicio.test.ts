import { describe, expect, it } from "vitest";

import type { OtherSessionView, SessionView, WeekView } from "@/lib/api";
import {
  claveDeDia,
  estadoDelDia,
  metaDeHoy,
  metaDelDia,
} from "@/lib/plan-ejercicio";

/**
 * La meta diaria de ejercicio sale del plan, no de un número fijo.
 *
 * Lo que se cuida: que declarar `timePerDay` gane siempre (es el dato más
 * honesto), que un día de descanso de verdad caiga a la meta chica, y que
 * un día con sesión pero sin declarar sume algo razonable en vez de
 * quedarse en el genérico de 30 — que fue exactamente la queja original.
 */

function gym(overrides: Partial<SessionView> = {}): SessionView {
  return {
    workoutId: "w1",
    date: "2026-09-02",
    muscleGroup: "Pierna",
    scheme: "5x5" as SessionView["scheme"],
    schemeLabel: "5x5",
    cardioMinutes: null,
    completedAt: null,
    trimmedMinutes: null,
    cycleNote: null,
    readinessNote: null,
    warmup: null,
    exercises: [],
    ...overrides,
  };
}

function otra(overrides: Partial<OtherSessionView> = {}): OtherSessionView {
  return {
    date: "2026-09-02",
    weekday: "MIE",
    discipline: "NATACION",
    minutes: 45,
    sesion: null,
    note: "",
    sharesDayWithGym: false,
    orden: 1,
    ...overrides,
  };
}

describe("claveDeDia", () => {
  it("2026-09-02 es miércoles", () => {
    expect(claveDeDia("2026-09-02")).toBe("MIE");
  });

  it("2026-08-30 es domingo", () => {
    expect(claveDeDia("2026-08-30")).toBe("DOM");
  });
});

describe("metaDeHoy", () => {
  const hoyISO = "2026-09-02"; // miércoles

  it("declarado en timePerDay gana sobre cualquier otra fuente", () => {
    const week: WeekView = { weekStart: "2026-08-31", today: hoyISO, sessions: [gym()], otherSessions: [] };
    const meta = metaDeHoy({ timePerDay: { MIE: 120 }, hoyISO, week });
    expect(meta).toEqual({ minutos: 120, fuente: "declarado" });
  });

  it("sin declarar, con gym + otra disciplina hoy: suma el default de gym más los minutos reales de la otra", () => {
    const week: WeekView = {
      weekStart: "2026-08-31",
      today: hoyISO,
      sessions: [gym()],
      otherSessions: [otra({ minutes: 40 })],
    };
    const meta = metaDeHoy({ timePerDay: null, hoyISO, week });
    expect(meta).toEqual({ minutos: 100, fuente: "estimado" });
  });

  it("sin declarar y sin nada programado hoy: día de descanso, meta chica", () => {
    const week: WeekView = { weekStart: "2026-08-31", today: hoyISO, sessions: [], otherSessions: [] };
    const meta = metaDeHoy({ timePerDay: null, hoyISO, week });
    expect(meta).toEqual({ minutos: 30, fuente: "descanso" });
  });

  it("timePerDay en 0 no cuenta como declarado — cae al resto de las fuentes", () => {
    const week: WeekView = { weekStart: "2026-08-31", today: hoyISO, sessions: [], otherSessions: [] };
    const meta = metaDeHoy({ timePerDay: { MIE: 0 }, hoyISO, week });
    expect(meta).toEqual({ minutos: 30, fuente: "descanso" });
  });

  it("semana sin materializar (null): también cae a descanso, no truena", () => {
    const meta = metaDeHoy({ timePerDay: null, hoyISO, week: null });
    expect(meta).toEqual({ minutos: 30, fuente: "descanso" });
  });
});

describe("metaDelDia", () => {
  it("usa el molde declarado para esa fecha", () => {
    expect(metaDelDia("2026-09-02", { MIE: 90 })).toBe(90);
  });

  it("sin molde, cae al genérico de actividad", () => {
    expect(metaDelDia("2026-09-02", null)).toBe(30);
  });
});

describe("estadoDelDia", () => {
  it("sin dato no es lo mismo que nada", () => {
    expect(estadoDelDia(null, 60)).toBe("sin_dato");
    expect(estadoDelDia(undefined, 60)).toBe("sin_dato");
  });

  it("llegar o pasar la meta es hecho", () => {
    expect(estadoDelDia(60, 60)).toBe("hecho");
    expect(estadoDelDia(90, 60)).toBe("hecho");
  });

  it("la mitad o más, sin llegar, es parcial", () => {
    expect(estadoDelDia(30, 60)).toBe("parcial");
    expect(estadoDelDia(45, 60)).toBe("parcial");
  });

  it("menos de la mitad es nada", () => {
    expect(estadoDelDia(10, 60)).toBe("nada");
    expect(estadoDelDia(0, 60)).toBe("nada");
  });
});
