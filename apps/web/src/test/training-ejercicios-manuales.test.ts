import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { generateWeek, sugerenciaDeEjercicios } from "@/lib/training/generate";
import type { ExerciseOption, HistoryWorkout, TrainingProfile } from "@/lib/training/types";

/** El catálogo real del seed, igual que en `training-generate.test.ts`. */
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
    sessionMinutes: 60,
    cardioMinWk: 0,
    avoidRepeatGroups: [],
    primaryDiscipline: "PESAS",
    otherDisciplines: [],
    disciplineLevels: { NATACION: "INTERMEDIO" },
    gymLevel: "AVANZADO",
    goal: "RECOMPOSICION",
    timePerDay: null,
    compactDays: false,
    schemePreference: "RECOMENDADO",
    ...overrides,
  };
}

const MONDAY = new Date("2026-01-05T12:00:00");

function generate(p: TrainingProfile, history: HistoryWorkout[] = []) {
  return generateWeek(p, history, { weekStart: MONDAY, catalog: CATALOG });
}

/** Ejercicios del catálogo de un grupo muscular, por id. */
function idsDeGrupo(grupo: string, cuantos: number): string[] {
  return CATALOG.filter((exercise) => exercise.muscleGroup === grupo)
    .slice(0, cuantos)
    .map((exercise) => exercise.id);
}

describe("sugerencia de Coachy", () => {
  it("propone la sesión del día sin generar la semana entera", () => {
    const sugeridos = sugerenciaDeEjercicios(profile(), "PIERNA_CUADRICEPS", CATALOG);
    expect(sugeridos.length).toBeGreaterThanOrEqual(4);
    expect(sugeridos.every((exercise) => exercise.muscleGroup === "PIERNA")).toBe(true);
  });

  it("tiene la forma de la sesión real: mismos grupos, sin pasarse de cupo", () => {
    const semana = generate(profile());
    const dia = semana.workouts.find((workout) => workout.dayKind === "PIERNA_CUADRICEPS");
    const sugeridos = sugerenciaDeEjercicios(profile(), "PIERNA_CUADRICEPS", CATALOG);

    // Los ejercicios concretos pueden diferir —el desempate rota con la semana
    // y con la posición del día—, pero la hoja de Ajustes no puede proponer un
    // día de otro tamaño ni de otros grupos que el que se va a entrenar.
    // La hoja enseña la sesión completa; el recorte por minutos pasa después,
    // el día que se entrena. Por eso puede traer uno más, nunca menos.
    expect(sugeridos.length).toBeGreaterThanOrEqual(dia!.exercises.length);
    expect(new Set(sugeridos.map((exercise) => exercise.muscleGroup))).toEqual(
      new Set(dia!.exercises.map((exercise) => exercise.muscleGroup)),
    );
  });
});

describe("ejercicios elegidos a mano", () => {
  it("van primero y en el orden que ella los dejó", () => {
    const elegidos = idsDeGrupo("PIERNA", 3);
    const semana = generate(profile({ manualExercises: { PIERNA_CUADRICEPS: elegidos } }));
    const dia = semana.workouts.find((workout) => workout.dayKind === "PIERNA_CUADRICEPS");

    expect(dia!.exercises.slice(0, 3).map((exercise) => exercise.exerciseId)).toEqual(elegidos);
  });

  it("la sugerencia completa lo que falta de volumen", () => {
    const elegidos = idsDeGrupo("PIERNA", 2);
    const semana = generate(profile({ manualExercises: { PIERNA_CUADRICEPS: elegidos } }));
    const dia = semana.workouts.find((workout) => workout.dayKind === "PIERNA_CUADRICEPS");

    expect(dia!.exercises.length).toBeGreaterThan(2);
    // Y no repite: lo que ella eligió no vuelve a salir por la puerta de atrás.
    const ids = dia!.exercises.map((exercise) => exercise.exerciseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("solo manda en su tipo de día", () => {
    const elegidos = idsDeGrupo("PIERNA", 3);
    const semana = generate(profile({ manualExercises: { PIERNA_CUADRICEPS: elegidos } }));
    const otro = semana.workouts.find((workout) => workout.dayKind !== "PIERNA_CUADRICEPS");

    expect(otro!.exercises.some((exercise) => elegidos.includes(exercise.exerciseId ?? ""))).toBe(false);
  });

  it("un id que ya no existe en el catálogo no deja el día vacío", () => {
    const semana = generate(
      profile({ manualExercises: { PIERNA_CUADRICEPS: ["ex-no-existe", ...idsDeGrupo("PIERNA", 1)] } }),
    );
    const dia = semana.workouts.find((workout) => workout.dayKind === "PIERNA_CUADRICEPS");

    expect(dia!.exercises.length).toBeGreaterThanOrEqual(4);
    expect(dia!.exercises.some((exercise) => exercise.exerciseId === "ex-no-existe")).toBe(false);
  });

  it("el recorte por minutos sigue mandando sobre lo elegido a mano", () => {
    const elegidos = idsDeGrupo("PIERNA", 6);
    const corto = generate(
      profile({ sessionMinutes: 30, manualExercises: { PIERNA_CUADRICEPS: elegidos } }),
    );
    const dia = corto.workouts.find((workout) => workout.dayKind === "PIERNA_CUADRICEPS");

    expect(dia!.exercises.length).toBeLessThan(elegidos.length);
  });

  it("la lesión sigue mandando: nada de impacto con lesión activa", () => {
    const impacto = CATALOG.filter((exercise) =>
      exercise.name.toLowerCase().includes("desplante"),
    ).map((exercise) => exercise.id);
    expect(impacto.length).toBeGreaterThan(0);

    const semana = generate(
      profile({
        conditions: ["lesion_rodilla"],
        manualExercises: { PIERNA_CUADRICEPS: impacto },
      }),
    );

    for (const workout of semana.workouts) {
      expect(workout.exercises.some((exercise) => impacto.includes(exercise.exerciseId ?? ""))).toBe(false);
    }
  });
});
