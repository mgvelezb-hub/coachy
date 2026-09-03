import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SEGUNDOS_DE_TRANSICION,
  SEGUNDOS_POR_REP,
  minutosDeEjercicio,
  recortarPorPrioridad,
  segundosDeSerie,
} from "@/lib/training/duracion";
import { generateWeek } from "@/lib/training/generate";
import type { ExerciseOption, TargetSet, TrainingProfile } from "@/lib/training/types";

const CATALOG: ExerciseOption[] = (
  JSON.parse(
    readFileSync(join(process.cwd(), "prisma/exercises.json"), "utf8"),
  ) as Array<Omit<ExerciseOption, "id" | "videoUrl">>
).map((row) => ({ ...row, id: `ex-${row.name}`, videoUrl: null }));

function profile(overrides: Partial<TrainingProfile> = {}): TrainingProfile {
  return {
    liftingDays: 6,
    trainingSchedule: null,
    conditions: [],
    volumeBias: "normal",
    sessionMinutes: 60,
    cardioMinWk: 0,
    avoidRepeatGroups: [],
    primaryDiscipline: "PESAS",
    otherDisciplines: [],
    disciplineLevels: {},
    gymLevel: "AVANZADO",
    goal: "RECOMPOSICION",
    timePerDay: null,
    compactDays: false,
    schemePreference: "RECOMENDADO",
    ...overrides,
  };
}

function serie(reps: number, extra: Partial<TargetSet> = {}): TargetSet {
  return { reps, weightKg: 40, warmup: false, ...extra };
}

describe("cuánto dura una serie", () => {
  it("sin tempo declarado cuenta 3 s por repetición", () => {
    expect(segundosDeSerie(serie(10))).toBe(10 * SEGUNDOS_POR_REP);
  });

  it("con tempo manda el tempo: 3-1-1 son 5 s por repetición", () => {
    expect(segundosDeSerie(serie(10, { tempo: { ecc: 3, pause: 1, con: 1 } }))).toBe(50);
  });

  it("el ejercicio suma ejecución, descansos y la transición", () => {
    const sets = [serie(10), serie(10), serie(10)];
    const esperado = (3 * (30 + 60) + SEGUNDOS_DE_TRANSICION) / 60;
    expect(minutosDeEjercicio(sets, 60)).toBeCloseTo(esperado, 5);
  });

  it("un dropset no descansa: por eso es un dropset", () => {
    const conDrop = minutosDeEjercicio([serie(10), serie(8, { intensity: "dropset" })], 60);
    const sinDrop = minutosDeEjercicio([serie(10), serie(8)], 60);
    expect(conDrop).toBeLessThan(sinDrop);
    expect(sinDrop - conDrop).toBeCloseTo(1, 5);
  });
});

describe("recorte por prioridad", () => {
  it("suelta primero el accesorio y respeta el orden de la sesión", () => {
    const items = [
      { nombre: "sentadilla", p: 1 },
      { nombre: "prensa", p: 2 },
      { nombre: "abductor", p: 4 },
      { nombre: "pantorrilla", p: 4 },
    ];
    const quedan = recortarPorPrioridad(items, (item) => item.p, (c) => c.length <= 2);
    expect(quedan.map((item) => item.nombre)).toEqual(["sentadilla", "prensa"]);
  });

  it("nunca baja del piso, aunque no quepa", () => {
    const items = [{ p: 1 }, { p: 4 }];
    expect(recortarPorPrioridad(items, (item) => item.p, () => false, 1)).toHaveLength(1);
  });
});

describe("la sesión cabe en los minutos declarados", () => {
  // El reporte que originó esta fase: perfil de 60 minutos, sesiones reales
  // de hora y media a dos horas.
  it("con 60 minutos ningún día pasa de 66 estimados", () => {
    // Cuatro semanas: la rotación de esquemas cambia el largo de la sesión
    // (5×6 no dura lo que 9×20), así que probar una sola semana no prueba nada.
    for (const lunes of ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]) {
      const week = generateWeek(profile(), [], {
        weekStart: new Date(`${lunes}T12:00:00`),
        catalog: CATALOG,
      });

      for (const dia of week.workouts) {
        expect(dia.estimatedMin, `${lunes} ${dia.dayKind}`).toBeLessThanOrEqual(66);
        expect(dia.exercises.length, `${lunes} ${dia.dayKind}`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("cada ejercicio trae sus minutos y suman los del día", () => {
    const week = generateWeek(profile(), [], {
      weekStart: new Date("2026-01-05T12:00:00"),
      catalog: CATALOG,
    });
    const dia = week.workouts[0]!;
    const suma = dia.exercises.reduce((total, e) => total + (e.estimatedMin ?? 0), 0);

    expect(dia.exercises.every((e) => (e.estimatedMin ?? 0) > 0)).toBe(true);
    expect(dia.estimatedMin).toBe(Math.round(suma + dia.warmup.totalSeg / 60));
  });

  it("menos minutos declarados es una sesión más corta, no la misma", () => {
    const config = { weekStart: new Date("2026-01-05T12:00:00"), catalog: CATALOG };
    const larga = generateWeek(profile({ sessionMinutes: 90 }), [], config);
    const corta = generateWeek(profile({ sessionMinutes: 45 }), [], config);

    expect(corta.workouts[0]!.estimatedMin!).toBeLessThan(larga.workouts[0]!.estimatedMin!);
    expect(corta.workouts[0]!.estimatedMin!).toBeLessThanOrEqual(50);
  });
});
