import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { ensureWeekMaterialized, parseStoredPlan } from "@/lib/training/db";
import { mondayOf } from "@/lib/training/generate";
import { persistSession } from "@/lib/training/session-write";
import { sessionSyncSchema } from "@/lib/validation/training";

/**
 * Integración contra la base local. Se salta sola si no hay Postgres, igual
 * que las demás pruebas de base.
 */
async function databaseReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`select 1`;
    return true;
  } catch {
    return false;
  }
}

const available = await databaseReachable();

describe.skipIf(!available)("rutina y sesiones contra la base", () => {
  const userId = randomUUID();
  const email = `test-${userId}@coachy.invalid`;
  const reference = new Date("2026-09-02T12:00:00");

  beforeAll(async () => {
    await prisma.user.create({ data: { id: userId, email, role: "ATHLETE" } });
    await prisma.profile.create({
      data: {
        userId,
        displayName: "Atleta de prueba",
        sex: "FEMALE",
        heightCm: "162.0",
        liftingDays: 5,
        sessionMinutes: 60,
        mealsPerDay: 4,
        goal: "RECOMPOSICION",
        onboardingCompletedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("materializa la semana una sola vez", async () => {
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId } });

    const first = await ensureWeekMaterialized(userId, profile, reference);
    expect(first).toHaveLength(5);
    expect(parseStoredPlan(first[0]!.exercisesJson).exercises.length).toBeGreaterThanOrEqual(4);

    const second = await ensureWeekMaterialized(userId, profile, reference);
    expect(second.map((row) => row.id)).toEqual(first.map((row) => row.id));

    const monday = mondayOf(reference);
    const count = await prisma.workout.count({ where: { userId, date: { gte: monday } } });
    expect(count).toBe(5);
  });

  it("guarda la sesión, detecta el PR y no duplica al reintentar", async () => {
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId } });
    const [workout] = await ensureWeekMaterialized(userId, profile, reference);
    const plan = parseStoredPlan(workout!.exercisesJson);
    const exercise = plan.exercises[0]!;

    const payload = sessionSyncSchema.parse({
      workoutId: workout!.id,
      completedAt: new Date().toISOString(),
      notes: "Se sintió bien",
      sets: [
        {
          clientId: `${workout!.id}:0:0`,
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.name,
          setIndex: 0,
          targetReps: 30,
          reps: 30,
          weightKg: null,
          rpe: 6,
          warmup: true,
          performedAt: new Date().toISOString(),
        },
        {
          clientId: `${workout!.id}:0:1`,
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.name,
          setIndex: 1,
          targetReps: 10,
          reps: 10,
          weightKg: 40,
          rpe: 7,
          warmup: false,
          performedAt: new Date().toISOString(),
        },
      ],
    });

    const saved = await persistSession(userId, payload);
    expect(saved).not.toBeNull();
    expect(saved?.volumeKg).toBe(400);
    expect(saved?.prs.map((pr) => pr.exerciseName)).toEqual([exercise.name]);

    // Reintento de la cola offline: mismas filas, mismos números.
    const retry = await persistSession(userId, payload);
    expect(retry?.volumeKg).toBe(400);

    const sets = await prisma.workoutSet.count({ where: { workoutId: workout!.id } });
    expect(sets).toBe(2);

    const stored = await prisma.workout.findUniqueOrThrow({ where: { id: workout!.id } });
    expect(stored.completedAt).not.toBeNull();
    const loads = stored.loadsJson as Record<string, unknown>;
    expect(loads.volumeKg).toBe(400);
    expect(loads.notes).toBe("Se sintió bien");
  });

  it("no escribe en la sesión de alguien más", async () => {
    const otherId = randomUUID();
    await prisma.user.create({
      data: { id: otherId, email: `test-${otherId}@coachy.invalid`, role: "ATHLETE" },
    });
    const [workout] = await prisma.workout.findMany({ where: { userId }, take: 1 });

    const result = await persistSession(
      otherId,
      sessionSyncSchema.parse({
        workoutId: workout!.id,
        completedAt: null,
        notes: null,
        sets: [
          {
            clientId: "intruso-0001",
            exerciseId: null,
            exerciseName: "Prensa de pierna",
            setIndex: 0,
            targetReps: 10,
            reps: 10,
            weightKg: 500,
            rpe: 5,
            warmup: false,
            performedAt: new Date().toISOString(),
          },
        ],
      }),
    );

    expect(result).toBeNull();
    const intruder = await prisma.workoutSet.count({ where: { clientId: "intruso-0001" } });
    expect(intruder).toBe(0);

    await prisma.user.deleteMany({ where: { id: otherId } });
  });

  it("la progresión de la semana siguiente usa lo que quedó registrado", async () => {
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId } });
    const nextWeek = new Date("2026-09-09T12:00:00");

    const workouts = await ensureWeekMaterialized(userId, profile, nextWeek);
    const planned = workouts.flatMap((row) => parseStoredPlan(row.exercisesJson).exercises);
    const withWeight = planned.filter((exercise) =>
      exercise.sets.some((set) => set.weightKg !== null),
    );

    // El único ejercicio con historial es el que se registró arriba.
    expect(withWeight.length).toBeGreaterThan(0);
  });
});
