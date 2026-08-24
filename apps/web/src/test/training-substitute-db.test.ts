import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { ensureWeekMaterialized, loadCatalog, parseStoredPlan } from "@/lib/training/db";
import { persistSession } from "@/lib/training/session-write";
import { alternativesFor } from "@/lib/training/substitutes";
import { sessionSyncSchema } from "@/lib/validation/training";

/**
 * Cambiar un ejercicio, de punta a punta: la cola manda la instrucción, el
 * servidor edita el plan y las series del ejercicio que se fue se van con él.
 *
 * Se salta sola si no hay Postgres, igual que las demás pruebas de base.
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

function setPayload(workoutId: string, exerciseIndex: number, name: string, exerciseId: string | null) {
  return {
    clientId: `${workoutId}:${exerciseIndex}:1`,
    exerciseId,
    exerciseName: name,
    setIndex: 1,
    targetReps: 10,
    reps: 10,
    weightKg: 40,
    rpe: 7,
    warmup: false,
    performedAt: new Date().toISOString(),
  };
}

describe.skipIf(!available)("cambiar ejercicio contra la base", () => {
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
        onboardingCompletedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("cambia el ejercicio, borra sus series y deja intacto el resto", async () => {
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId } });
    const [workout] = await ensureWeekMaterialized(userId, profile, reference);
    const plan = parseStoredPlan(workout!.exercisesJson);
    const catalog = await loadCatalog();

    const first = plan.exercises[0]!;
    const second = plan.exercises[1]!;
    const taken = plan.exercises.map((exercise) => exercise.name);

    // En la base local el catálogo todavía no tiene videos (viven en el bucket
    // de Supabase), así que el respaldo del mismo grupo sale vacío. Para probar
    // la escritura basta con un equivalente que el servidor acepte.
    const alternative = alternativesFor(first, catalog, taken)[0] ?? {
      exerciseId: catalog.find(
        (option) => option.muscleGroup === first.muscleGroup && !taken.includes(option.name),
      )!.id,
      name: catalog.find(
        (option) => option.muscleGroup === first.muscleGroup && !taken.includes(option.name),
      )!.name,
      declared: false,
      videoPath: null,
    };

    expect(alternative).toBeDefined();

    // Antes del cambio: una serie en cada uno de los dos ejercicios.
    await persistSession(
      userId,
      sessionSyncSchema.parse({
        workoutId: workout!.id,
        completedAt: null,
        notes: null,
        sets: [
          setPayload(workout!.id, 0, first.name, first.exerciseId),
          setPayload(workout!.id, 1, second.name, second.exerciseId),
        ],
      }),
    );
    expect(await prisma.workoutSet.count({ where: { workoutId: workout!.id } })).toBe(2);

    const saved = await persistSession(
      userId,
      sessionSyncSchema.parse({
        workoutId: workout!.id,
        completedAt: null,
        notes: null,
        sets: [],
        substitutions: [{ exerciseIndex: 0, exerciseId: alternative!.exerciseId }],
      }),
    );

    expect(saved?.substitutions).toEqual([
      { exerciseIndex: 0, ok: true, name: alternative!.name },
    ]);

    const stored = parseStoredPlan(
      (await prisma.workout.findUniqueOrThrow({ where: { id: workout!.id } })).exercisesJson,
    );

    expect(stored.exercises[0]?.name).toBe(alternative!.name);
    // Mismo esquema y misma forma de series: cambia la máquina, no el estímulo.
    expect(stored.exercises[0]?.scheme).toBe(first.scheme);
    expect(stored.exercises[0]?.sets.map((set) => set.reps)).toEqual(
      first.sets.map((set) => set.reps),
    );
    expect(stored.exercises[0]?.sets.every((set) => set.weightKg === null)).toBe(true);
    // El resto de la sesión no se movió.
    expect(stored.exercises[1]?.name).toBe(second.name);

    const remaining = await prisma.workoutSet.findMany({ where: { workoutId: workout!.id } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.exerciseName).toBe(second.name);
  });

  it("reenviar el mismo cambio no borra lo capturado después", async () => {
    const [workout] = await prisma.workout.findMany({ where: { userId }, take: 1 });
    const plan = parseStoredPlan(workout!.exercisesJson);
    const current = plan.exercises[0]!;

    // La cola reintenta: el plan ya tiene ese ejercicio, así que es un no-op.
    const again = await persistSession(
      userId,
      sessionSyncSchema.parse({
        workoutId: workout!.id,
        completedAt: null,
        notes: null,
        sets: [setPayload(workout!.id, 0, current.name, current.exerciseId)],
        substitutions: [{ exerciseIndex: 0, exerciseId: current.exerciseId as string }],
      }),
    );

    expect(again?.substitutions[0]?.ok).toBe(true);
    const sets = await prisma.workoutSet.findMany({ where: { workoutId: workout!.id } });
    expect(sets.map((set) => set.exerciseName)).toContain(current.name);
  });

  it("rechaza un ejercicio que no es equivalente y no toca el plan", async () => {
    const [workout] = await prisma.workout.findMany({ where: { userId }, take: 1 });
    const plan = parseStoredPlan(workout!.exercisesJson);
    const catalog = await loadCatalog();
    const foreign = catalog.find((option) => option.muscleGroup !== plan.exercises[0]?.muscleGroup);

    const result = await persistSession(
      userId,
      sessionSyncSchema.parse({
        workoutId: workout!.id,
        completedAt: null,
        notes: null,
        sets: [],
        substitutions: [{ exerciseIndex: 0, exerciseId: foreign!.id }],
      }),
    );

    expect(result?.substitutions[0]).toMatchObject({ ok: false, reason: "no equivalente" });

    const stored = parseStoredPlan(
      (await prisma.workout.findUniqueOrThrow({ where: { id: workout!.id } })).exercisesJson,
    );
    expect(stored.exercises[0]?.name).toBe(plan.exercises[0]?.name);
  });

  it("no cambia el ejercicio de la sesión de alguien más", async () => {
    const otherId = randomUUID();
    await prisma.user.create({
      data: { id: otherId, email: `test-${otherId}@coachy.invalid`, role: "ATHLETE" },
    });
    const [workout] = await prisma.workout.findMany({ where: { userId }, take: 1 });
    const catalog = await loadCatalog();

    const result = await persistSession(
      otherId,
      sessionSyncSchema.parse({
        workoutId: workout!.id,
        completedAt: null,
        notes: null,
        sets: [],
        substitutions: [{ exerciseIndex: 0, exerciseId: catalog[0]!.id }],
      }),
    );

    expect(result).toBeNull();
    await prisma.user.delete({ where: { id: otherId } });
  });
});
