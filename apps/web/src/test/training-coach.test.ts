import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  TEMPO_COACH,
  aplicaEsquemaDeCoach,
  esUnilateral,
  formatoTempo,
  pesosPorIntensidad,
  seriesPorLado,
} from "@/lib/training/coach";
import { generateWeek } from "@/lib/training/generate";
import { intensityForReps } from "@/lib/training/progression";
import { SCHEMES, schemeForWeek } from "@/lib/training/schemes";
import type { ExerciseOption, TargetSet, TrainingProfile } from "@/lib/training/types";

const CATALOG: ExerciseOption[] = (
  JSON.parse(
    readFileSync(join(process.cwd(), "prisma/exercises.json"), "utf8"),
  ) as Array<Omit<ExerciseOption, "id" | "videoUrl">>
).map((row) => ({ ...row, id: `ex-${row.name}`, videoUrl: null }));

function profile(overrides: Partial<TrainingProfile> = {}): TrainingProfile {
  return {
    liftingDays: 5,
    trainingSchedule: null,
    conditions: [],
    volumeBias: "normal",
    sessionMinutes: 90,
    cardioMinWk: 0,
    avoidRepeatGroups: [],
    primaryDiscipline: "PESAS",
    otherDisciplines: [],
    disciplineLevels: {},
    gymLevel: "AVANZADO",
    goal: "RECOMPOSICION",
    timePerDay: null,
    compactDays: false,
    schemePreference: "COACH",
    ...overrides,
  };
}

const CONFIG = { weekStart: new Date("2026-01-05T12:00:00"), catalog: CATALOG };

function serie(reps: number, weightKg: number | null = 40): TargetSet {
  return { reps, weightKg, warmup: false };
}

describe("piramidal de peso", () => {
  it("es 15-12-10-8 subiendo peso", () => {
    expect(SCHEMES.PIRAMIDAL_PESO.reps).toEqual([15, 12, 10, 8]);
  });

  it("los pesos salen de la tabla de intensidad, no de una rampa inventada", () => {
    const sets = pesosPorIntensidad(
      [serie(15), serie(12), serie(10), serie(8)],
      100,
    );
    const pesos = sets.map((set) => set.weightKg);

    // La serie tope (menos reps) se queda con el peso de trabajo.
    expect(pesos[3]).toBe(100);
    // Las demás salen del cociente de intensidades contra esa.
    expect(pesos[0]).toBeCloseTo(
      Math.round(100 * (intensityForReps(15) / intensityForReps(8)) * 2) / 2,
      5,
    );
    // Y suben serie a serie, que es lo que hace "piramidal de peso".
    expect(pesos).toEqual([...pesos].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it("sin peso de trabajo no inventa nada", () => {
    expect(pesosPorIntensidad([serie(15, null)], null)[0]!.weightKg).toBeNull();
  });
});

describe("preferencia COACH", () => {
  it("rota piramidal de peso y rango medio", () => {
    const impar = schemeForWeek(new Date("2026-01-05T12:00:00"), "COACH");
    const par = schemeForWeek(new Date("2026-01-12T12:00:00"), "COACH");
    expect(new Set([impar, par])).toEqual(new Set(["PIRAMIDAL_PESO", "RANGO_MEDIO"]));
  });

  it("pone tempo en las series efectivas y el fallo solo en el accesorio", () => {
    const base = [{ reps: 12, weightKg: 20, warmup: true }, serie(12), serie(10)];

    const accesorio = aplicaEsquemaDeCoach(base, {
      scheme: "RANGO_MEDIO",
      preference: "COACH",
      topWeightKg: 40,
      accesorio: true,
      unilateral: false,
      unilateralMode: "SEGUIDO",
    });
    expect(accesorio[0]!.tempo).toBeUndefined();
    expect(accesorio[1]!.tempo).toEqual(TEMPO_COACH);
    expect(accesorio[1]!.intensity).toBeUndefined();
    expect(accesorio[2]!.intensity).toBe("fallo");

    const basico = aplicaEsquemaDeCoach(base, {
      scheme: "RANGO_MEDIO",
      preference: "COACH",
      topWeightKg: 40,
      accesorio: false,
      unilateral: false,
      unilateralMode: "SEGUIDO",
    });
    expect(basico.every((set) => set.intensity === undefined)).toBe(true);
  });

  it("sin la preferencia no toca nada", () => {
    const sets = aplicaEsquemaDeCoach([serie(12)], {
      scheme: "RANGO_MEDIO",
      preference: "RECOMENDADO",
      topWeightKg: 40,
      accesorio: true,
      unilateral: false,
      unilateralMode: "SEGUIDO",
    });
    expect(sets[0]).toEqual(serie(12));
  });

  it("el tempo se lee 3-1-1", () => {
    expect(formatoTempo(TEMPO_COACH)).toBe("3-1-1");
  });
});

describe("unilaterales", () => {
  it("reconoce los que se hacen de un lado a la vez", () => {
    expect(esUnilateral({ name: "Sentadilla búlgara", poolRole: "unilateral" })).toBe(true);
    expect(esUnilateral({ name: "Remo con mancuerna", poolRole: "jalon_horizontal" })).toBe(true);
    expect(esUnilateral({ name: "Curl concentrado", poolRole: "bicep_aislado" })).toBe(true);
    expect(esUnilateral({ name: "Elevación lateral en polea", poolRole: "deltoide_lateral" })).toBe(true);
    expect(esUnilateral({ name: "Press de banca", poolRole: "empuje_horizontal" })).toBe(false);
    expect(esUnilateral({ name: "Elevación lateral con mancuernas", poolRole: "deltoide_lateral" })).toBe(false);
  });

  it("SEGUIDO hace todas las del derecho y luego las del izquierdo", () => {
    const lados = seriesPorLado([serie(12), serie(10)], "SEGUIDO").map((set) => set.side);
    expect(lados).toEqual(["DER", "DER", "IZQ", "IZQ"]);
  });

  it("ALTERNADO va cambiando de lado serie a serie", () => {
    const lados = seriesPorLado([serie(12), serie(10)], "ALTERNADO").map((set) => set.side);
    expect(lados).toEqual(["DER", "IZQ", "DER", "IZQ"]);
  });

  it("el generador marca el ejercicio y le reparte los lados", () => {
    const week = generateWeek(profile(), [], CONFIG);
    const unilaterales = week.workouts
      .flatMap((dia) => dia.exercises)
      .filter((ejercicio) => ejercicio.unilateral);

    expect(unilaterales.length).toBeGreaterThan(0);
    for (const ejercicio of unilaterales) {
      expect(ejercicio.sets.every((set) => set.side !== undefined), ejercicio.name).toBe(true);
    }
  });

  it("el modo cambia el orden de los lados, no cuántas series son", () => {
    const seguido = generateWeek(profile({ unilateralMode: "SEGUIDO" }), [], CONFIG);
    const alternado = generateWeek(profile({ unilateralMode: "ALTERNADO" }), [], CONFIG);

    const unoSeguido = seguido.workouts.flatMap((d) => d.exercises).find((e) => e.unilateral)!;
    const unoAlternado = alternado.workouts
      .flatMap((d) => d.exercises)
      .find((e) => e.name === unoSeguido.name)!;

    expect(unoAlternado.sets).toHaveLength(unoSeguido.sets.length);
    expect(unoAlternado.sets.map((s) => s.side)).not.toEqual(unoSeguido.sets.map((s) => s.side));
  });
});
