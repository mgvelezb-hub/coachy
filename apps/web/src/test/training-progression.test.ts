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
 * La serie de aproximación y el prellenado, que son las dos cosas que la
 * atleta ve primero al abrir el primer ejercicio en el gimnasio.
 *
 * El bug que originó estas pruebas: el "calentamiento" se pintaba idéntico a
 * la serie 1 — mismas reps, mismo peso — así que no calentaba nada. La
 * solución de entonces (reps altísimas, 20-50) generó una queja nueva del
 * dueño: se veía y se sentía igual que el primer ejercicio con más
 * repeticiones. Desde 2026-09 la movilidad general vive ANTES de la sesión
 * (`calentamiento.ts`); lo que queda aquí es solo la serie de aproximación al
 * peso de trabajo — 10-12 reps al ~50%, una sola.
 */

function last(overrides: Partial<LastPerformance> = {}): LastPerformance {
  return {
    date: "2026-08-17",
    topWeightKg: 60,
    topReps: 10,
    topRpe: 7,
    completedScheme: true,
    repsPorSerie: [10, 10, 10],
    ...overrides,
  };
}

describe("serie de aproximación", () => {
  it("las reps caen siempre en el rango 10-12, para cualquier esquema", () => {
    for (const scheme of Object.values(SCHEMES)) {
      const reps = warmupRepsFor(scheme);
      expect(reps).toBeGreaterThanOrEqual(WARMUP_REPS_MIN);
      expect(reps).toBeLessThanOrEqual(WARMUP_REPS_MAX);
    }
  });

  it("pesa ~50% del peso de trabajo, al disco de 2.5", () => {
    const sets = buildWarmupSets(SCHEMES.FUERZA, 60, 1);

    expect(sets).toHaveLength(1);
    expect(sets[0]?.weightKg).toBe(30);
    expect(sets[0]?.warmup).toBe(true);
    expect(sets[0]?.reps).toBeGreaterThanOrEqual(WARMUP_REPS_MIN);
    expect(sets[0]?.reps).toBeLessThanOrEqual(WARMUP_REPS_MAX);
    expect(roundPlate(sets[0]?.weightKg as number)).toBe(sets[0]?.weightKg);
  });

  it("deja el peso vacío cuando no hay historial: no se inventa una carga", () => {
    const sets = buildWarmupSets(SCHEMES.PIRAMIDAL, null, 1);
    expect(sets.every((set) => set.weightKg === null)).toBe(true);
  });

  it("el plan del ejercicio nunca empata la aproximación con la serie 1", () => {
    for (const scheme of Object.values(SCHEMES)) {
      const sets = buildTargetSets(scheme, 80, { warmupSets: 1 });
      const warmups = sets.filter((set) => set.warmup);
      const working = sets.filter((set) => !set.warmup);
      const first = working[0] as TargetSet;

      expect(warmups).toHaveLength(1);
      const warmup = warmups[0] as TargetSet;
      const sameReps = warmup.reps === first.reps;
      const sameWeight = warmup.weightKg === first.weightKg;
      expect(sameReps && sameWeight).toBe(false);
      expect(warmup.weightKg as number).toBeLessThan(first.weightKg as number);
    }
  });
});

describe("prellenado por serie", () => {
  it("escala el peso serie a serie en piramidal, no repite el mismo en las 5", () => {
    const empty = buildTargetSets(SCHEMES.PIRAMIDAL, null, { warmupSets: 1 });
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
    const planned = buildTargetSets(SCHEMES.PIRAMIDAL, 100, { warmupSets: 1 });
    const filled = prefillSets({ name: "Sentadilla" }, SCHEMES.PIRAMIDAL, planned, last());
    expect(filled).toEqual(planned);
  });

  it("sin historial deja los campos vacíos", () => {
    const empty = buildTargetSets(SCHEMES.RANGO_MEDIO, null, { warmupSets: 1 });
    const filled = prefillSets({ name: "Remo" }, SCHEMES.RANGO_MEDIO, empty, null);
    expect(filled.every((set) => set.weightKg === null)).toBe(true);
  });

  it("la aproximación prellenada sigue siendo más ligera que la serie 1", () => {
    const empty = buildTargetSets(SCHEMES.METABOLICO, null, { warmupSets: 1 });
    const filled = prefillSets({ name: "Prensa" }, SCHEMES.METABOLICO, empty, last());

    const warmup = filled.find((set) => set.warmup) as TargetSet;
    const first = filled.find((set) => !set.warmup) as TargetSet;

    expect(warmup.weightKg as number).toBeLessThan(first.weightKg as number);
  });
});
