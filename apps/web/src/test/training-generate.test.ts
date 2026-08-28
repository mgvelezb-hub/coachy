import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { generateWeek } from "@/lib/training/generate";
import { incrementFor, intensityForReps, suggestTopWeight } from "@/lib/training/progression";
import { SCHEMES, isoWeekNumber, schemeForWeek } from "@/lib/training/schemes";
import { buildSplit, parseInjuries } from "@/lib/training/split";
import type {
  ExerciseOption,
  HistorySet,
  HistoryWorkout,
  TrainingProfile,
} from "@/lib/training/types";

/** El catálogo real del seed: si el generador no funciona con él, no funciona. */
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
    ...overrides,
  };
}

/** Lunes 2026-01-05 = semana ISO 2. */
const MONDAY = new Date("2026-01-05T12:00:00");

function generate(p: TrainingProfile, history: HistoryWorkout[] = [], weekStart = MONDAY) {
  return generateWeek(p, history, { weekStart, catalog: CATALOG });
}

describe("split semanal", () => {
  it("respeta liftingDays", () => {
    expect(generate(profile({ liftingDays: 5 })).workouts).toHaveLength(5);
    expect(generate(profile({ liftingDays: 4 })).workouts).toHaveLength(4);
    expect(generate(profile({ liftingDays: 3 })).workouts).toHaveLength(3);
    expect(generate(profile({ liftingDays: 0 })).workouts).toHaveLength(0);
  });

  it("con 5 días arma el split del coach: pierna ×2, hombro, pecho+espalda, brazo", () => {
    const week = generate(profile({ liftingDays: 5 }));
    expect(week.workouts.map((w) => w.dayKind)).toEqual([
      "PIERNA_CUADRICEPS",
      "HOMBRO",
      "PECHO_ESPALDA",
      "PIERNA_FEMORAL",
      "BRAZO",
    ]);
  });

  it("con 6 días mete el tercer día de pierna", () => {
    const kinds = generate(profile({ liftingDays: 6 })).workouts.map((w) => w.dayKind);
    expect(kinds.filter((kind) => kind.startsWith("PIERNA"))).toHaveLength(3);
  });

  it("usa trainingSchedule cuando existe: entrena los días declarados", () => {
    const week = generate(
      profile({
        liftingDays: 3,
        trainingSchedule: {
          LUN: "MANANA",
          MAR: "DESCANSO",
          MIE: "TARDE",
          JUE: "DESCANSO",
          VIE: "MANANA",
          SAB: "DESCANSO",
          DOM: "DESCANSO",
        },
      }),
    );
    expect(week.workouts.map((w) => w.date)).toEqual(["2026-01-05", "2026-01-07", "2026-01-09"]);
  });
});

describe("protocolo de lesión", () => {
  it("lee la zona de las condiciones del perfil", () => {
    expect(parseInjuries(["lesion_rodilla"])).toEqual({ active: true, zones: ["PIERNA"] });
    expect(parseInjuries(["lesion_activa"])).toEqual({ active: true, zones: [] });
    expect(parseInjuries(["glucosa_alta"])).toEqual({ active: false, zones: [] });
  });

  it("deja la zona afectada una sola vez por semana, con reps altas y peso bajo", () => {
    const week = generate(profile({ liftingDays: 5, conditions: ["lesion_rodilla"] }));
    const legDays = week.workouts.filter((w) => w.dayKind.startsWith("PIERNA"));
    expect(legDays).toHaveLength(1);

    const legExercises = (legDays[0]?.exercises ?? []).filter((e) => e.muscleGroup === "PIERNA");
    expect(legExercises.length).toBeGreaterThan(0);
    for (const exercise of legExercises) {
      expect(exercise.scheme).toBe("REHAB");
      expect(Math.max(...exercise.sets.filter((s) => !s.warmup).map((s) => s.reps))).toBe(25);
    }
  });

  it("los demás días no tocan la zona lesionada y el resto del cuerpo sigue normal", () => {
    const week = generate(profile({ liftingDays: 5, conditions: ["lesion_rodilla"] }));
    const otherDays = week.workouts.filter((w) => !w.dayKind.startsWith("PIERNA"));
    expect(otherDays).toHaveLength(4);
    for (const workout of otherDays) {
      expect(workout.exercises.some((e) => e.muscleGroup === "PIERNA")).toBe(false);
      expect(workout.exercises.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("suspende el impacto: nada de cardio ni desplantes caminando", () => {
    const week = generate(
      profile({ liftingDays: 5, cardioMinWk: 150, conditions: ["lesion_activa"] }),
    );
    expect(week.workouts.every((w) => w.cardioMinutes === null)).toBe(true);
    const names = week.workouts.flatMap((w) => w.exercises.map((e) => e.name.toLowerCase()));
    expect(names.some((name) => name.includes("caminando"))).toBe(false);
  });

  it("con lesión sin zona no toca el split", () => {
    const { kinds } = buildSplit({ liftingDays: 5, conditions: ["lesion_activa"] });
    expect(kinds).toHaveLength(5);
  });
});

describe("rotación de esquemas", () => {
  it("rota piramidal → fuerza → metabólico → rango medio por semana ISO", () => {
    const weeks = [
      new Date("2025-12-29T12:00:00"), // ISO 1
      new Date("2026-01-05T12:00:00"), // ISO 2
      new Date("2026-01-12T12:00:00"), // ISO 3
      new Date("2026-01-19T12:00:00"), // ISO 4
      new Date("2026-01-26T12:00:00"), // ISO 5 → vuelve a empezar
    ];
    expect(weeks.map(isoWeekNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(weeks.map(schemeForWeek)).toEqual([
      "PIRAMIDAL",
      "FUERZA",
      "METABOLICO",
      "RANGO_MEDIO",
      "PIRAMIDAL",
    ]);
  });

  it("la semana generada usa el esquema de su semana ISO", () => {
    const week = generate(profile(), [], new Date("2026-01-12T12:00:00"));
    expect(week.scheme).toBe("METABOLICO");
    const first = week.workouts[0]?.exercises[0];
    expect(first?.sets.filter((s) => !s.warmup).map((s) => s.reps)).toEqual([30, 28, 25]);
  });

  it("los ejercicios de volumen siempre van a 9 series", () => {
    const week = generate(profile({ liftingDays: 6, sessionMinutes: 90 }));
    const nine = week.workouts
      .flatMap((w) => w.exercises)
      .filter((e) => ["abductor", "trapecio", "pantorrilla"].includes(e.poolRole));
    expect(nine.length).toBeGreaterThan(0);
    for (const exercise of nine) {
      expect(exercise.sets.filter((s) => !s.warmup)).toHaveLength(9);
    }
  });
});

describe("calentamiento", () => {
  it("el primer ejercicio abre con series de calentamiento de reps altas", () => {
    const week = generate(profile());
    for (const workout of week.workouts) {
      const [first, ...rest] = workout.exercises;
      const warmups = first?.sets.filter((s) => s.warmup) ?? [];
      expect(warmups).toHaveLength(2);
      expect(warmups.every((s) => s.reps >= 20 && s.reps <= 50)).toBe(true);
      expect(warmups.every((s) => s.weightKg === null)).toBe(true);
      expect(rest.every((e) => e.sets.every((s) => !s.warmup))).toBe(true);
    }
  });
});

describe("tiempo disponible", () => {
  it("45 min ⇒ máximo 5 ejercicios", () => {
    const week = generate(profile({ liftingDays: 5, sessionMinutes: 45 }));
    for (const workout of week.workouts) {
      expect(workout.exercises.length).toBeLessThanOrEqual(5);
      expect(workout.exercises.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("60+ min ⇒ 6-8 ejercicios", () => {
    const week = generate(profile({ liftingDays: 5, sessionMinutes: 75 }));
    for (const workout of week.workouts) {
      expect(workout.exercises.length).toBeGreaterThanOrEqual(6);
      expect(workout.exercises.length).toBeLessThanOrEqual(8);
    }
  });

  it("con volumen reducido recorta un ejercicio", () => {
    const normal = generate(profile({ sessionMinutes: 60, volumeBias: "normal" }));
    const cut = generate(profile({ sessionMinutes: 60, volumeBias: "reducido" }));
    expect(cut.workouts[0]?.exercises.length).toBe(
      (normal.workouts[0]?.exercises.length ?? 0) - 1,
    );
  });
});

describe("progresión de cargas", () => {
  function historySets(name: string, weights: number[], reps: number[], rpe: number): HistorySet[] {
    return weights.map((weight, index) => ({
      exerciseId: `ex-${name}`,
      exerciseName: name,
      setIndex: index,
      targetReps: reps[index] as number,
      reps: reps[index] as number,
      weightKg: weight,
      rpe,
      warmup: false,
    }));
  }

  const NAME = "Prensa de pierna";

  it("sin historial deja el peso vacío", () => {
    const week = generate(profile());
    const sets = week.workouts[0]?.exercises.flatMap((e) => e.sets) ?? [];
    expect(sets.length).toBeGreaterThan(0);
    expect(sets.every((s) => s.weightKg === null)).toBe(true);
  });

  it("sube 5 kg en barra/máquina cuando completó el esquema con RPE ≤ 8", () => {
    const last = {
      date: "2026-01-05",
      topWeightKg: 100,
      topReps: 6,
      topRpe: 7,
      completedScheme: true,
    };
    expect(suggestTopWeight({ name: NAME }, SCHEMES.FUERZA, last)).toBe(105);
  });

  it("sube 2.5 kg cuando es mancuerna", () => {
    const last = {
      date: "2026-01-05",
      topWeightKg: 10,
      topReps: 6,
      topRpe: 8,
      completedScheme: true,
    };
    expect(incrementFor("Press militar con mancuernas")).toBe(2.5);
    expect(suggestTopWeight({ name: "Press militar con mancuernas" }, SCHEMES.FUERZA, last)).toBe(
      12.5,
    );
  });

  it("no sube si falló el esquema o el RPE fue alto", () => {
    const base = { date: "2026-01-05", topWeightKg: 100, topReps: 6, topRpe: 7 };
    expect(suggestTopWeight({ name: NAME }, SCHEMES.FUERZA, { ...base, completedScheme: false })).toBe(
      100,
    );
    expect(
      suggestTopWeight({ name: NAME }, SCHEMES.FUERZA, {
        ...base,
        completedScheme: true,
        topRpe: 9,
      }),
    ).toBe(100);
    expect(
      suggestTopWeight({ name: NAME }, SCHEMES.FUERZA, {
        ...base,
        completedScheme: true,
        topRpe: null,
      }),
    ).toBe(100);
  });

  it("traduce el peso cuando cambia el rango de reps de la semana", () => {
    expect(intensityForReps(2)).toBeGreaterThan(intensityForReps(30));
    const last = {
      date: "2026-01-05",
      topWeightKg: 100,
      topReps: 6,
      topRpe: 9,
      completedScheme: true,
    };
    const metabolic = suggestTopWeight({ name: NAME }, SCHEMES.METABOLICO, last) as number;
    expect(metabolic).toBeLessThan(100);
    const pyramid = suggestTopWeight({ name: NAME }, SCHEMES.PIRAMIDAL, last) as number;
    expect(pyramid).toBeGreaterThan(100);
  });

  it("prefill de la rutina: usa lo último registrado del ejercicio", () => {
    // Semana ISO 6 vuelve a caer en FUERZA (misma rotación que la ISO 2).
    const history: HistoryWorkout[] = [
      {
        date: "2026-01-05",
        exerciseNames: [NAME],
        sets: historySets(NAME, [60, 60, 60, 60, 60], [6, 6, 6, 6, 6], 7),
      },
    ];
    const week = generate(
      profile({ liftingDays: 5, sessionMinutes: 90 }),
      history,
      new Date("2026-02-02T12:00:00"),
    );
    const prensa = week.workouts
      .flatMap((w) => w.exercises)
      .find((e) => e.name === NAME);
    expect(prensa).toBeDefined();
    const top = Math.max(...(prensa?.sets ?? []).map((s) => s.weightKg ?? 0));
    expect(top).toBe(65);
  });
});

describe("determinismo", () => {
  it("la misma entrada produce la misma semana", () => {
    const a = generate(profile({ liftingDays: 6 }));
    const b = generate(profile({ liftingDays: 6 }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("no repite el accesorio exacto de la semana pasada", () => {
    const before = generate(profile({ liftingDays: 5, sessionMinutes: 90 }));
    const history: HistoryWorkout[] = before.workouts.map((workout) => ({
      date: workout.date,
      exerciseNames: workout.exercises.map((e) => e.name),
      sets: [],
    }));
    const after = generate(
      profile({ liftingDays: 5, sessionMinutes: 90 }),
      history,
      new Date("2026-01-12T12:00:00"),
    );

    const accessoriesBefore = new Set(
      before.workouts.flatMap((w) => w.exercises.slice(4).map((e) => e.name)),
    );
    const accessoriesAfter = after.workouts.flatMap((w) => w.exercises.slice(4).map((e) => e.name));
    const repeated = accessoriesAfter.filter((name) => accessoriesBefore.has(name));
    expect(repeated.length).toBeLessThan(accessoriesAfter.length);
  });
});
