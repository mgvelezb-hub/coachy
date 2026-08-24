import { describe, expect, it } from "vitest";

import {
  alternativesFor,
  catalogEntryFor,
  isAllowedSubstitute,
  withSubstitute,
} from "@/lib/training/substitutes";
import type { ExerciseOption, PlannedExercise } from "@/lib/training/types";

/**
 * Lo que sostiene "Cambiar ejercicio": qué se ofrece, en qué orden, y qué se
 * conserva del plan cuando la máquina cambia.
 */

function option(partial: Partial<ExerciseOption> & { name: string }): ExerciseOption {
  return {
    id: partial.id ?? `id-${partial.name}`,
    name: partial.name,
    muscleGroup: partial.muscleGroup ?? "PIERNA",
    poolRole: partial.poolRole ?? "cuadriceps_compuesto",
    videoUrl: partial.videoUrl === undefined ? `library/${partial.name}.mp4` : partial.videoUrl,
    isTracker: partial.isTracker ?? false,
    substitutes: partial.substitutes ?? [],
  };
}

const CATALOG: ExerciseOption[] = [
  option({ name: "Prensa de pierna", substitutes: ["Hack squat", "Back squat en Smith"] }),
  option({ name: "Hack squat" }),
  option({ name: "Back squat en Smith" }),
  option({ name: "Sentadilla búlgara", poolRole: "unilateral" }),
  option({ name: "Extensión de pierna", videoUrl: null }),
  option({ name: "Curl de bíceps", muscleGroup: "BICEP" }),
];

const PLANNED: PlannedExercise = {
  exerciseId: "id-Prensa de pierna",
  name: "Prensa de pierna",
  muscleGroup: "PIERNA",
  poolRole: "cuadriceps_compuesto",
  scheme: "PIRAMIDAL",
  schemeLabel: "5 series 10-8-6-4-2 subiendo peso",
  restSeconds: 60,
  videoPath: "library/prensa.mp4",
  tracker: true,
  note: null,
  sets: [
    { reps: 15, weightKg: 30, warmup: true },
    { reps: 10, weightKg: 80, warmup: false },
    { reps: 8, weightKg: 90, warmup: false },
  ],
};

describe("opciones para cambiar un ejercicio", () => {
  it("pone primero los sustitutos declarados y después el mismo grupo", () => {
    const options = alternativesFor(PLANNED, CATALOG);

    expect(options.slice(0, 2).map((entry) => entry.name)).toEqual([
      "Hack squat",
      "Back squat en Smith",
    ]);
    expect(options.slice(0, 2).every((entry) => entry.declared)).toBe(true);
    expect(options.map((entry) => entry.name)).toContain("Sentadilla búlgara");
  });

  it("no ofrece otro grupo muscular ni el ejercicio mismo", () => {
    const names = alternativesFor(PLANNED, CATALOG).map((entry) => entry.name);

    expect(names).not.toContain("Curl de bíceps");
    expect(names).not.toContain("Prensa de pierna");
  });

  it("el respaldo del mismo grupo exige video", () => {
    const names = alternativesFor(PLANNED, CATALOG).map((entry) => entry.name);
    expect(names).not.toContain("Extensión de pierna");
  });

  it("no ofrece lo que ya está en la sesión de hoy", () => {
    const names = alternativesFor(PLANNED, CATALOG, ["Hack squat"]).map((entry) => entry.name);
    expect(names).not.toContain("Hack squat");
  });

  it("cruza los sustitutos escritos a mano con el nombre del catálogo", () => {
    // El seed dice "Prensa"; el catálogo, "Prensa de pierna".
    const extension = option({ name: "Extensión de pierna", substitutes: ["Prensa"] });
    const options = alternativesFor(
      { exerciseId: extension.id, name: extension.name, muscleGroup: "PIERNA" },
      [extension, ...CATALOG],
    );

    expect(options[0]?.name).toBe("Prensa de pierna");
    expect(options[0]?.declared).toBe(true);
  });

  it("encuentra el ejercicio del catálogo aunque el plan no traiga id", () => {
    const entry = catalogEntryFor({ exerciseId: null, name: "Hack squat" }, CATALOG);
    expect(entry?.id).toBe("id-Hack squat");
  });
});

describe("qué se acepta como cambio", () => {
  it("acepta el mismo grupo muscular", () => {
    const candidate = CATALOG.find((row) => row.name === "Sentadilla búlgara") as ExerciseOption;
    expect(isAllowedSubstitute(PLANNED, candidate, CATALOG)).toBe(true);
  });

  it("rechaza cambiar pierna por bíceps", () => {
    const candidate = CATALOG.find((row) => row.name === "Curl de bíceps") as ExerciseOption;
    expect(isAllowedSubstitute(PLANNED, candidate, CATALOG)).toBe(false);
  });
});

describe("el ejercicio sustituido", () => {
  it("conserva el esquema y la forma de las series, y borra los pesos", () => {
    const candidate = CATALOG.find((row) => row.name === "Hack squat") as ExerciseOption;
    const next = withSubstitute(PLANNED, candidate);

    expect(next.name).toBe("Hack squat");
    expect(next.exerciseId).toBe(candidate.id);
    expect(next.scheme).toBe(PLANNED.scheme);
    expect(next.restSeconds).toBe(PLANNED.restSeconds);
    expect(next.sets.map((set) => set.reps)).toEqual([15, 10, 8]);
    expect(next.sets.map((set) => set.warmup)).toEqual([true, false, false]);
    expect(next.sets.every((set) => set.weightKg === null)).toBe(true);
  });
});
