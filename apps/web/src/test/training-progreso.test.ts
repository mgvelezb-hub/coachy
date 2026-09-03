import { describe, expect, it } from "vitest";

import {
  cumplio,
  lineaDeSerie,
  lunesDe,
  tendenciaSemanal,
  type SerieComparada,
} from "@/lib/training/progreso";

function serie(overrides: Partial<SerieComparada> = {}): SerieComparada {
  return {
    exerciseName: "Prensa",
    setIndex: 1,
    targetReps: 12,
    targetWeightKg: 40,
    reps: 10,
    weightKg: 40,
    rpe: null,
    warmup: false,
    side: null,
    intensity: null,
    ...overrides,
  };
}

describe("planeado contra real", () => {
  it("una línea por serie, en el orden en que se pregunta", () => {
    expect(lineaDeSerie(serie())).toBe("Serie 2 · plan 12 × 40 kg · real 10 × 40 kg");
  });

  it("sin peso planeado se dice 'sin peso', no un cero que mentiría", () => {
    expect(lineaDeSerie(serie({ targetWeightKg: null }))).toContain("plan 12 × sin peso");
  });

  it("cumplir es llegar a las reps; el calentamiento no se juzga", () => {
    expect(cumplio(serie({ reps: 12 }))).toBe(true);
    expect(cumplio(serie({ reps: 13 }))).toBe(true);
    expect(cumplio(serie({ reps: 10 }))).toBe(false);
    expect(cumplio(serie({ reps: 1, warmup: true }))).toBe(true);
  });
});

describe("tendencia semanal", () => {
  it("agrupa por lunes, sin importar la zona del servidor", () => {
    expect(lunesDe("2026-09-03")).toBe("2026-08-31");
    expect(lunesDe("2026-08-31")).toBe("2026-08-31");
    expect(lunesDe("2026-09-06")).toBe("2026-08-31");
    expect(lunesDe("2026-09-07")).toBe("2026-09-07");
  });

  it("saca el peso tope y el volumen de cada semana", () => {
    const tendencia = tendenciaSemanal([
      { date: "2026-08-31", reps: 10, weightKg: 40, warmup: false },
      { date: "2026-09-02", reps: 8, weightKg: 50, warmup: false },
      { date: "2026-09-07", reps: 10, weightKg: 55, warmup: false },
    ]);

    expect(tendencia).toEqual([
      { weekStart: "2026-08-31", topWeightKg: 50, volumeKg: 800, sets: 2 },
      { weekStart: "2026-09-07", topWeightKg: 55, volumeKg: 550, sets: 1 },
    ]);
  });

  it("el calentamiento y lo que fue sin peso no cuentan", () => {
    const tendencia = tendenciaSemanal([
      { date: "2026-08-31", reps: 12, weightKg: 20, warmup: true },
      { date: "2026-08-31", reps: 12, weightKg: null, warmup: false },
      { date: "2026-08-31", reps: 10, weightKg: 40, warmup: false },
    ]);

    expect(tendencia).toEqual([
      { weekStart: "2026-08-31", topWeightKg: 40, volumeKg: 400, sets: 1 },
    ]);
  });

  it("sin series efectivas no inventa una semana vacía", () => {
    expect(tendenciaSemanal([{ date: "2026-08-31", reps: 0, weightKg: 40, warmup: false }])).toEqual(
      [],
    );
  });
});
