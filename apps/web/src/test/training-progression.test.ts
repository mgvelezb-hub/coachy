import { describe, expect, it } from "vitest";

import {
  buildTargetSets,
  buildWarmupSets,
  prefillSets,
  roundPlate,
  warmupRepsFor,
  WARMUP_REPS_MAX,
  WARMUP_REPS_MIN,
  type LastPerformance,
} from "@/lib/training/progression";
import { SCHEMES } from "@/lib/training/schemes";
import type { TargetSet } from "@/lib/training/types";

/**
 * El calentamiento y el prellenado, que son las dos cosas que la atleta ve
 * primero al abrir un ejercicio en el gimnasio.
 *
 * El bug que originó estas pruebas: el calentamiento se pintaba idéntico a la
 * serie 1 — mismas reps, mismo peso — así que no calentaba nada.
 */

function last(overrides: Partial<LastPerformance> = {}): LastPerformance {
  return {
    date: "2026-08-17",
    topWeightKg: 60,
    topReps: 10,
    topRpe: 7,
    completedScheme: true,
    ...overrides,
  };
}

describe("calentamiento", () => {
  it("nunca repite las reps de la serie más larga del esquema", () => {
    for (const scheme of Object.values(SCHEMES)) {
      const reps = warmupRepsFor(scheme);
      expect(reps).toBeGreaterThan(Math.max(...scheme.reps));
      expect(reps).toBeGreaterThanOrEqual(WARMUP_REPS_MIN);
      expect(reps).toBeLessThanOrEqual(WARMUP_REPS_MAX);
    }
  });

  it("en metabólico calienta por encima de las 30 reps de la serie 1", () => {
    // El caso del reporte: 3×30-28-25 con calentamiento de 30 reps se veía igual.
    expect(warmupRepsFor(SCHEMES.METABOLICO)).toBe(40);
  });

  it("pesa entre el 40% y el 50% del peso de trabajo, al disco de 2.5", () => {
    const sets = buildWarmupSets(SCHEMES.FUERZA, 60, 2);

    expect(sets).toHaveLength(2);
    expect(sets.map((set) => set.weightKg)).toEqual([25, 30]);
    expect(sets.every((set) => set.warmup)).toBe(true);
    for (const set of sets) {
      expect(roundPlate(set.weightKg as number)).toBe(set.weightKg);
      expect(set.weightKg as number).toBeLessThan(60 * 0.55);
    }
  });

  it("deja el peso vacío cuando no hay historial: no se inventa una carga", () => {
    const sets = buildWarmupSets(SCHEMES.PIRAMIDAL, null, 2);
    expect(sets.every((set) => set.weightKg === null)).toBe(true);
  });

  it("el plan del ejercicio nunca empata calentamiento con serie 1", () => {
    for (const scheme of Object.values(SCHEMES)) {
      const sets = buildTargetSets(scheme, 80, { warmupSets: 2 });
      const warmups = sets.filter((set) => set.warmup);
      const working = sets.filter((set) => !set.warmup);
      const first = working[0] as TargetSet;

      expect(warmups).toHaveLength(2);
      for (const warmup of warmups) {
        const sameReps = warmup.reps === first.reps;
        const sameWeight = warmup.weightKg === first.weightKg;
        expect(sameReps && sameWeight).toBe(false);
        expect(warmup.weightKg as number).toBeLessThan(first.weightKg as number);
      }
    }
  });
});

describe("prellenado por serie", () => {
  it("escala el peso serie a serie en piramidal, no repite el mismo en las 5", () => {
    const empty = buildTargetSets(SCHEMES.PIRAMIDAL, null, { warmupSets: 2 });
    const filled = prefillSets({ name: "Sentadilla" }, SCHEMES.PIRAMIDAL, empty, last());

    const working = filled.filter((set) => !set.warmup).map((set) => set.weightKg as number);
    expect(working).toHaveLength(5);
    expect(new Set(working).size).toBe(5);

    for (let i = 1; i < working.length; i += 1) {
      expect(working[i] as number).toBeGreaterThan(working[i - 1] as number);
    }
  });

  it("en un esquema plano sí repite el mismo peso en todas las series", () => {
    const empty = buildTargetSets(SCHEMES.FUERZA, null, { warmupSets: 0 });
    const filled = prefillSets({ name: "Press de banca" }, SCHEMES.FUERZA, empty, last());

    const working = filled.map((set) => set.weightKg as number);
    expect(new Set(working).size).toBe(1);
  });

  it("aplica la progresión doble: sube si cumplió el esquema con RPE ≤ 8", () => {
    const empty = buildTargetSets(SCHEMES.FUERZA, null, { warmupSets: 0 });

    const earned = prefillSets(
      { name: "Press de banca" },
      SCHEMES.FUERZA,
      empty,
      last({ topReps: 6, topRpe: 7, completedScheme: true }),
    );
    const held = prefillSets(
      { name: "Press de banca" },
      SCHEMES.FUERZA,
      empty,
      last({ topReps: 6, topRpe: 9, completedScheme: true }),
    );

    expect(earned[0]?.weightKg as number).toBeGreaterThan(held[0]?.weightKg as number);
  });

  it("traduce el peso entre rangos de reps: el 5×2 no se levanta con el peso del 3×30", () => {
    const pyramid = prefillSets(
      { name: "Sentadilla" },
      SCHEMES.PIRAMIDAL,
      buildTargetSets(SCHEMES.PIRAMIDAL, null, { warmupSets: 0 }),
      last({ topReps: 30, topWeightKg: 40, topRpe: 9 }),
    );

    const top = pyramid[pyramid.length - 1]?.weightKg as number;
    expect(top).toBeGreaterThan(40);
  });

  it("no toca lo que el plan ya traía escrito", () => {
    const planned = buildTargetSets(SCHEMES.PIRAMIDAL, 100, { warmupSets: 2 });
    const filled = prefillSets({ name: "Sentadilla" }, SCHEMES.PIRAMIDAL, planned, last());
    expect(filled).toEqual(planned);
  });

  it("sin historial deja los campos vacíos", () => {
    const empty = buildTargetSets(SCHEMES.RANGO_MEDIO, null, { warmupSets: 2 });
    const filled = prefillSets({ name: "Remo" }, SCHEMES.RANGO_MEDIO, empty, null);
    expect(filled.every((set) => set.weightKg === null)).toBe(true);
  });

  it("el calentamiento prellenado sigue siendo más ligero que la serie 1", () => {
    const empty = buildTargetSets(SCHEMES.METABOLICO, null, { warmupSets: 2 });
    const filled = prefillSets({ name: "Prensa" }, SCHEMES.METABOLICO, empty, last());

    const warmup = filled.find((set) => set.warmup) as TargetSet;
    const first = filled.find((set) => !set.warmup) as TargetSet;

    expect(warmup.weightKg as number).toBeLessThan(first.weightKg as number);
    expect(warmup.reps).not.toBe(first.reps);
  });
});
