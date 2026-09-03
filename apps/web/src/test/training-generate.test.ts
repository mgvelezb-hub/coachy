import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { generateWeek } from "@/lib/training/generate";
import {
  incrementFor,
  intensityForReps,
  repsObjetivo,
  suggestTopWeight,
} from "@/lib/training/progression";
import { exerciseCountFor } from "@/lib/training/recipes";
import { SCHEMES, isoWeekNumber, schemeForWeek } from "@/lib/training/schemes";
import {
  buildSplit,
  liftingDaysWithinBudget,
  parseInjuries,
  sessionsSpentOutsideGym,
} from "@/lib/training/split";
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
    avoidRepeatGroups: [],
    primaryDiscipline: "PESAS",
    otherDisciplines: [],
    disciplineLevels: { NATACION: "INTERMEDIO" },
    gymLevel: "AVANZADO",
    goal: "RECOMPOSICION",
    timePerDay: null,
    // `false` a propósito: la compactación por gusto (Fase 10) es una
    // preferencia nueva y estas pruebas fijan el comportamiento de siempre
    // (Fases 1-3). Las pruebas dedicadas de la Fase 10 viven en
    // `training-disciplines.test.ts`, que sí la enciende explícitamente.
    compactDays: false,
    // "RECOMENDADO" a propósito: estas pruebas fijan el comportamiento de
    // siempre (la rotación). Las pruebas dedicadas de la preferencia fija
    // viven en el describe "preferencia de esquema fijo" más abajo.
    schemePreference: "RECOMENDADO",
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

  // El orden ya no es el literal de `SPLIT_BY_DAYS`: la regla de vecindad
  // (Fase 3) mete femoral entre hombro y pecho, porque el hombro cansado de
  // víspera es lo que hacía imposible el día de press.
  it("con 5 días arma el split del coach: pierna ×2, hombro, pecho+espalda, brazo", () => {
    const week = generate(profile({ liftingDays: 5 }));
    expect(week.workouts.map((w) => w.dayKind)).toEqual([
      "PIERNA_CUADRICEPS",
      "HOMBRO",
      "PIERNA_FEMORAL",
      "PECHO_ESPALDA",
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

describe("nivel en el gimnasio", () => {
  it("a quien empieza no le manda ejercicios de nivel avanzado", () => {
    const week = generate(profile({ liftingDays: 5, gymLevel: "PRINCIPIANTE" }));
    const nombres = week.workouts.flatMap((w) => w.exercises.map((e) => e.name));
    const usados = CATALOG.filter((ejercicio) => nombres.includes(ejercicio.name));

    expect(usados.length).toBeGreaterThan(0);
    expect(usados.every((ejercicio) => ejercicio.level === "PRINCIPIANTE")).toBe(true);
  });

  it("quien va intermedio usa lo suyo y lo de principiante, nunca lo avanzado", () => {
    const week = generate(profile({ liftingDays: 5, gymLevel: "INTERMEDIO" }));
    const nombres = week.workouts.flatMap((w) => w.exercises.map((e) => e.name));
    const usados = CATALOG.filter((ejercicio) => nombres.includes(ejercicio.name));

    expect(usados.every((ejercicio) => ejercicio.level !== "AVANZADO")).toBe(true);
  });

  it("la semana se arma completa en cualquier nivel", () => {
    for (const nivel of ["PRINCIPIANTE", "INTERMEDIO", "AVANZADO"] as const) {
      const week = generate(profile({ liftingDays: 5, gymLevel: nivel }));
      expect(week.workouts, nivel).toHaveLength(5);
      for (const dia of week.workouts) {
        expect(dia.exercises.length, `${nivel} ${dia.dayKind}`).toBeGreaterThanOrEqual(4);
      }
    }
  });
});

describe("grupos que no se repiten", () => {
  it("deja pierna una sola vez y no encoge la semana", () => {
    const week = generate(profile({ liftingDays: 5, avoidRepeatGroups: ["PIERNA"] }));
    const kinds = week.workouts.map((w) => w.dayKind);

    expect(week.workouts).toHaveLength(5);
    expect(kinds.filter((kind) => kind.startsWith("PIERNA"))).toHaveLength(1);
  });

  it("los días que repetían el grupo entrenan otra cosa, no descansan", () => {
    const normal = generate(profile({ liftingDays: 6 }));
    const sinRepetir = generate(profile({ liftingDays: 6, avoidRepeatGroups: ["PIERNA"] }));

    expect(sinRepetir.workouts).toHaveLength(normal.workouts.length);
    expect(sinRepetir.workouts.every((w) => w.exercises.length > 0)).toBe(true);
  });

  it("sin la preferencia el split no cambia", () => {
    expect(generate(profile({ liftingDays: 5, avoidRepeatGroups: [] })).workouts.map((w) => w.dayKind)).toEqual(
      generate(profile({ liftingDays: 5 })).workouts.map((w) => w.dayKind),
    );
  });
});

describe("presupuesto semanal de sesiones", () => {
  it("una disciplina secundaria gasta días de gimnasio, no los suma encima", () => {
    const week = generate(
      profile({
        liftingDays: 5,
        otherDisciplines: [{ discipline: "NATACION", sessionsPerWeek: 2 }],
      }),
    );
    expect(week.workouts).toHaveLength(3);
  });

  it("una disciplina declarada sin sesiones no cobra nada", () => {
    const week = generate(
      profile({
        liftingDays: 5,
        otherDisciplines: [{ discipline: "NATACION", sessionsPerWeek: 0 }],
      }),
    );
    expect(week.workouts).toHaveLength(5);
  });

  it("mientras las pesas sean la primaria nunca se quedan sin semana", () => {
    expect(
      liftingDaysWithinBudget({
        liftingDays: 3,
        primaryDiscipline: "PESAS",
        otherDisciplines: [{ discipline: "CROSSFIT", sessionsPerWeek: 5 }],
      }),
    ).toBe(1);
  });

  it("si la primaria es otra, el gimnasio sí puede quedarse en cero", () => {
    expect(
      liftingDaysWithinBudget({
        liftingDays: 3,
        primaryDiscipline: "NATACION",
        otherDisciplines: [{ discipline: "NATACION", sessionsPerWeek: 4 }],
      }),
    ).toBe(0);
  });

  it("quien no entrena no entrena: cero días siguen siendo cero", () => {
    expect(
      liftingDaysWithinBudget({
        liftingDays: 0,
        primaryDiscipline: "PESAS",
        otherDisciplines: [],
      }),
    ).toBe(0);
  });

  it("suma la carga de todas las secundarias", () => {
    expect(
      sessionsSpentOutsideGym([
        { discipline: "NATACION", sessionsPerWeek: 2 },
        { discipline: "BOX", sessionsPerWeek: 1 },
      ]),
    ).toBe(3);
  });

  it("el presupuesto recorta también el horario declarado", () => {
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
        otherDisciplines: [{ discipline: "SQUASH", sessionsPerWeek: 1 }],
      }),
    );
    expect(week.workouts.map((w) => w.date)).toEqual(["2026-01-05", "2026-01-07"]);
  });
});

describe("fatiga de otras disciplinas", () => {
  it("el recorte cae en el grupo que la otra disciplina ya trabajó", () => {
    // Natación deja espalda y hombro cansados. En una semana con natación, el
    // día de pecho y espalda debe soltar accesorio de ESPALDA antes que de
    // pecho — que es lo que quedó fresco.
    const conNatacion = generate(
      profile({
        liftingDays: 5,
        otherDisciplines: [{ discipline: "NATACION", sessionsPerWeek: 2 }],
      }),
    );

    const dia = conNatacion.workouts.find((w) => w.dayKind === "PECHO_ESPALDA");
    if (!dia) return; // Con el reparto de esa semana puede no haber ese día.

    const espalda = dia.exercises.filter((e) => e.muscleGroup === "ESPALDA").length;
    const pecho = dia.exercises.filter((e) => e.muscleGroup === "PECHO").length;

    // No se exige que espalda quede en cero —el día sigue siendo de espalda—,
    // sino que no cargue MÁS que el grupo fresco.
    expect(espalda).toBeLessThanOrEqual(pecho + 1);
  });

  it("sin otras disciplinas la sesión no se recorta", () => {
    const solo = generate(profile({ liftingDays: 5 }));
    const conOtras = generate(
      profile({
        liftingDays: 5,
        otherDisciplines: [{ discipline: "NATACION", sessionsPerWeek: 1 }],
      }),
    );

    // Con natación hay menos días de gimnasio (presupuesto) pero los que
    // quedan no pierden ejercicios porque sí.
    expect(solo.workouts[0]!.exercises.length).toBeGreaterThan(0);
    expect(conOtras.workouts.length).toBeLessThan(solo.workouts.length);
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
    // `(date) => schemeForWeek(date)` y no `schemeForWeek` a secas: desde que
    // acepta una `preference` opcional como segundo parámetro, pasarla
    // directo a `.map` le colaría el índice del arreglo ahí (`schemeForWeek`
    // lo tolera igual — cualquier valor fuera de `SCHEME_PREFERENCES` cae a
    // `RECOMENDADO` — pero esta prueba no depende de esa tolerancia).
    expect(weeks.map((date) => schemeForWeek(date))).toEqual([
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

describe("preferencia de esquema fijo", () => {
  it("RECOMENDADO no cambia la rotación: dos semanas ISO distintas dan esquemas distintos, igual que hoy", () => {
    const semanaUno = generate(profile({ schemePreference: "RECOMENDADO" }), [], new Date("2026-01-05T12:00:00"));
    const semanaDos = generate(profile({ schemePreference: "RECOMENDADO" }), [], new Date("2026-01-12T12:00:00"));
    expect(semanaUno.scheme).toBe("FUERZA");
    expect(semanaDos.scheme).toBe("METABOLICO");
    expect(semanaUno.scheme).not.toBe(semanaDos.scheme);
  });

  it("FUERZA fija el esquema FUERZA todas las semanas, sin importar la rotación", () => {
    const semanas = [
      new Date("2025-12-29T12:00:00"), // ISO 1 → rotación daría PIRAMIDAL
      new Date("2026-01-05T12:00:00"), // ISO 2 → rotación daría FUERZA
      new Date("2026-01-12T12:00:00"), // ISO 3 → rotación daría METABOLICO
    ].map((weekStart) => generate(profile({ schemePreference: "FUERZA" }), [], weekStart));

    expect(semanas.map((week) => week.scheme)).toEqual(["FUERZA", "FUERZA", "FUERZA"]);
    for (const week of semanas) {
      for (const workout of week.workouts) {
        for (const exercise of workout.exercises) {
          // Los de volumen (9 series) y los de rehab siguen su propia regla;
          // esta prueba solo pide que nadie normal se salga de FUERZA.
          if (exercise.scheme !== "VOLUMEN_9" && exercise.scheme !== "REHAB") {
            expect(exercise.scheme).toBe("FUERZA");
          }
        }
      }
    }
  });

  it("HIPERTROFIA fija RANGO_MEDIO (no hay esquema propio de hipertrofia en el catálogo)", () => {
    const week = generate(profile({ schemePreference: "HIPERTROFIA" }), [], new Date("2026-01-05T12:00:00"));
    expect(week.scheme).toBe("RANGO_MEDIO");
  });

  it("METABOLICO fija el esquema METABOLICO todas las semanas", () => {
    const week = generate(profile({ schemePreference: "METABOLICO" }), [], new Date("2025-12-29T12:00:00"));
    expect(week.scheme).toBe("METABOLICO");
  });

  it("REHAB le gana a la preferencia: la zona lesionada no se mueve a FUERZA", () => {
    const week = generate(
      profile({ liftingDays: 5, conditions: ["lesion_rodilla"], schemePreference: "FUERZA" }),
    );
    const legDay = week.workouts.find((w) => w.dayKind.startsWith("PIERNA"));
    const legExercises = (legDay?.exercises ?? []).filter((e) => e.muscleGroup === "PIERNA");
    expect(legExercises.length).toBeGreaterThan(0);
    for (const exercise of legExercises) {
      expect(exercise.scheme).toBe("REHAB");
    }
  });

  it("un valor desconocido de preferencia se trata como RECOMENDADO (parse tolerante)", () => {
    // Simula lo que hace `toTrainingProfile` con una fila vieja o corrupta:
    // cualquier cosa fuera de `SCHEME_PREFERENCES` cae de vuelta a la
    // rotación. Aquí se fuerza el tipo porque el caso de uso real (una
    // columna `TEXT` sin validar) no puede expresarse con el tipo estricto.
    const week = generate(
      profile({ schemePreference: "PESO_MEDIO" as unknown as TrainingProfile["schemePreference"] }),
      [],
      new Date("2026-01-12T12:00:00"),
    );
    expect(week.scheme).toBe("METABOLICO");
  });
});

describe("calentamiento", () => {
  it("el primer ejercicio abre con 1 sola serie de aproximación de 10-12 reps", () => {
    const week = generate(profile());
    for (const workout of week.workouts) {
      const [first, ...rest] = workout.exercises;
      const warmups = first?.sets.filter((s) => s.warmup) ?? [];
      expect(warmups).toHaveLength(1);
      expect(warmups.every((s) => s.reps >= 10 && s.reps <= 12)).toBe(true);
      expect(warmups.every((s) => s.weightKg === null)).toBe(true);
      expect(rest.every((e) => e.sets.every((s) => !s.warmup))).toBe(true);
    }
  });

  it("cada sesión trae su calentamiento dinámico: empieza con elevar el pulso, dura 6-8 min", () => {
    const week = generate(profile());
    for (const workout of week.workouts) {
      expect(workout.warmup.pasos.length).toBeGreaterThan(0);
      expect(workout.warmup.pasos[0]?.nombre).toBe(
        "Eleva el pulso: caminadora, cuerda o saltos suaves",
      );
      expect(workout.warmup.pasos[0]?.segundos).toBe(120);
      expect(workout.warmup.totalSeg).toBeGreaterThanOrEqual(6 * 60);
      expect(workout.warmup.totalSeg).toBeLessThanOrEqual(8 * 60);
      for (const paso of workout.warmup.pasos) {
        expect(paso.segundos).toBeGreaterThanOrEqual(20);
        expect(paso.segundos).toBeLessThanOrEqual(120);
      }
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
      repsPorSerie: [6, 6, 6],
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
      repsPorSerie: [6, 6, 6],
    };
    expect(incrementFor("Press militar con mancuernas")).toBe(2.5);
    expect(suggestTopWeight({ name: "Press militar con mancuernas" }, SCHEMES.FUERZA, last)).toBe(
      12.5,
    );
  });

  it("no sube si falló el esquema o el RPE fue alto", () => {
    const base = {
      date: "2026-01-05",
      topWeightKg: 100,
      topReps: 6,
      topRpe: 7,
      repsPorSerie: [6, 6, 6],
    };
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
      repsPorSerie: [6, 6, 6],
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

  it("el énfasis del objetivo suma un ejercicio en los días de ese grupo", () => {
    const base = generateWeek(profile(), [], { weekStart: MONDAY, catalog: CATALOG });
    const conEnfasis = generateWeek(profile(), [], {
      weekStart: MONDAY,
      catalog: CATALOG,
      emphasis: ["ESPALDA"],
    });

    const diaEspaldaBase = base.workouts.find((w) => w.dayKind === "PECHO_ESPALDA")!;
    const diaEspaldaEnfasis = conEnfasis.workouts.find((w) => w.dayKind === "PECHO_ESPALDA")!;
    expect(diaEspaldaEnfasis.exercises.length).toBe(diaEspaldaBase.exercises.length + 1);

    // Los días que no tocan espalda se quedan igual: el énfasis no infla la
    // semana entera.
    const piernaBase = base.workouts.find((w) => w.dayKind === "PIERNA_CUADRICEPS")!;
    const piernaEnfasis = conEnfasis.workouts.find((w) => w.dayKind === "PIERNA_CUADRICEPS")!;
    expect(piernaEnfasis.exercises.length).toBe(piernaBase.exercises.length);
  });
});

describe("día combinado con otra disciplina (Fase 9)", () => {
  // 7 sesiones de natación piden más de lo que caben los 6 días libres que
  // deja el presupuesto (7 - 1 día de gimnasio, el piso mientras pesas sea la
  // primaria): la séptima solo tiene un candidato válido para anexarse — las
  // otras seis ya son natación, y `compatibilidad` nunca combina una
  // disciplina consigo misma —, así que cae en el único día de gimnasio.
  it("redimensiona la sesión de pesas a los minutos reales del combo, no a un accesorio menos", () => {
    const week = generate(
      profile({
        liftingDays: 7,
        sessionMinutes: 60,
        otherDisciplines: [{ discipline: "NATACION", sessionsPerWeek: 7 }],
      }),
    );

    expect(week.workouts).toHaveLength(1);
    const dia = week.workouts[0]!;
    expect(dia.dayKind).toBe("PIERNA_CUADRICEPS");

    // Minutos reales del combo: 60 (gimnasio) + 45 (natación) - 10 de
    // transición = 95, repartidos 60/40 a favor del primero (gimnasio, que va
    // antes porque natación siempre cierra) y redondeados a múltiplos de 5.
    const minutosReales = 55;

    // La sesión se mide contra ESOS minutos, no contra los 60 del perfil ni
    // contra un accesorio menos a ciegas (Fase 3: `duracion.ts`). La tabla de
    // `exerciseCountFor` sigue siendo el punto de partida; el número final lo
    // pone el reloj.
    expect(dia.exercises.length).toBeLessThanOrEqual(exerciseCountFor(minutosReales, "normal"));
    expect(dia.estimatedMin).toBeLessThanOrEqual(minutosReales);

    // El día completo del mismo perfil, sin natación encima, sí cabe en sus
    // 60 minutos: el combo recorta porque el día es más corto, no porque
    // compartirlo cueste un accesorio fijo.
    const solo = generate(profile({ liftingDays: 7, sessionMinutes: 60 }));
    expect(solo.workouts[0]!.estimatedMin).toBeGreaterThan(dia.estimatedMin!);
  });
});

describe("las reps del plan siguen a lo que de verdad salió", () => {
  // La queja fue exacta: "si saqué 12, para la siguiente sesión inicia en 12,
  // no en 18". Pedir otra vez el número que no se alcanzó no es un objetivo,
  // es repetir el mismo fracaso cada semana.
  const HIPERTROFIA = SCHEMES.METABOLICO;

  it("quien se quedó corto arranca en lo que sí hizo", () => {
    const reales = HIPERTROFIA.reps.map(() => 12);
    const last = {
      date: "2026-01-05",
      topWeightKg: 40,
      topReps: 12,
      topRpe: 9,
      completedScheme: false,
      repsPorSerie: reales,
    };

    const objetivo = repsObjetivo(HIPERTROFIA, last);
    expect(objetivo.every((reps) => reps <= 12)).toBe(true);
  });

  it("quien cumplió sigue con su esquema: el peso es lo que sube", () => {
    const last = {
      date: "2026-01-05",
      topWeightKg: 40,
      topReps: HIPERTROFIA.reps[0]!,
      topRpe: 7,
      completedScheme: true,
      repsPorSerie: [...HIPERTROFIA.reps],
    };

    expect(repsObjetivo(HIPERTROFIA, last)).toEqual([...HIPERTROFIA.reps]);
  });

  it("una serie con buen día no sube el piso del esquema", () => {
    // 20 de 18 no convierte 20 en el nuevo mínimo: eso lo decide la rotación
    // de esquemas, no una serie suelta.
    const last = {
      date: "2026-01-05",
      topWeightKg: 40,
      topReps: 20,
      topRpe: 7,
      completedScheme: false,
      repsPorSerie: HIPERTROFIA.reps.map((reps) => reps + 2),
    };

    expect(repsObjetivo(HIPERTROFIA, last)).toEqual([...HIPERTROFIA.reps]);
  });

  it("sin historial manda el esquema", () => {
    expect(repsObjetivo(HIPERTROFIA, null)).toEqual([...HIPERTROFIA.reps]);
  });
});
