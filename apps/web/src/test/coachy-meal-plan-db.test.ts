import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { currentMealPlan, ensureMealPlans } from "@/lib/coachy/menu";
import { prisma } from "@/lib/prisma";

/**
 * La nutrición que sí se ve.
 *
 * El reporte que originó esta prueba: "me sigue sin aparecer nada respecto a
 * nutrición". La causa era que las decisiones importadas nunca pasaron por
 * `runCoachy`, así que existían con sus macros pero sin un solo `meal_plan`.
 * Esto verifica el arreglo: el menú se materializa a demanda, con los números
 * que ya estaban guardados, y correrlo dos veces no duplica nada.
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

describe.skipIf(!available)("menús a demanda contra la base", () => {
  const userId = randomUUID();
  let decisionId = "";

  beforeAll(async () => {
    await prisma.user.create({
      data: { id: userId, email: `menu-${userId}@coachy.invalid`, role: "ATHLETE" },
    });
    await prisma.profile.create({
      data: {
        userId,
        displayName: "Atleta de prueba",
        sex: "FEMALE",
        heightCm: "170.0",
        weightKg: "82.0",
        liftingDays: 5,
        cardioMinWk: 20,
        mealsPerDay: 4,
        trainingTime: "MEDIODIA",
        goal: "PERDIDA_GRASA",
        currentPhase: "BASE",
        onboardingCompletedAt: new Date(),
      },
    });

    // Una decisión como las que deja el importador: aprobada, sin publicar,
    // sin semilla de menú y sin un solo meal_plan.
    const checkIn = await prisma.checkIn.create({
      data: {
        userId,
        date: new Date("2026-08-21T12:00:00.000Z"),
        weightKg: "80.0",
        inflammation: 2,
        energy: 4,
        hunger: 3,
        satiety: 3,
        sleep: 4,
        dietCompliance: 80,
        trainingCompliance: 80,
        symptoms: [],
      },
    });

    const decision = await prisma.decision.create({
      data: {
        checkInId: checkIn.id,
        userId,
        phase: "REINTRO",
        kcal: 1700,
        proteinG: 130,
        fatG: 45,
        carbsG: 195,
        explanation: "Reinicio tras pausa larga: déficit moderado, sin cut.",
        status: "APROBADA",
      },
    });
    decisionId = decision.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("arranca sin menús: es exactamente el estado que el atleta veía vacío", async () => {
    expect(await prisma.mealPlan.count({ where: { decisionId } })).toBe(0);
  });

  it("materializa los dos menús con gramos, equivalencias y lista de súper", async () => {
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId } });
    const decision = await prisma.decision.findUniqueOrThrow({
      where: { id: decisionId },
      include: { checkIn: { select: { date: true } } },
    });

    const plans = await ensureMealPlans(decision, profile, 80);

    expect(plans).toHaveLength(2);
    expect(plans.map((plan) => plan.menuNumber)).toEqual([1, 2]);

    const meals = plans[0]?.mealsJson as Array<Record<string, unknown>>;
    expect(Array.isArray(meals)).toBe(true);
    expect(meals.length).toBe(profile.mealsPerDay);

    const items = meals[0]?.items as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThan(0);
    expect(typeof items[0]?.grams).toBe("number");
    expect(items[0]?.grams as number).toBeGreaterThan(0);

    expect(Array.isArray(plans[0]?.equivalencesJson)).toBe(true);
    expect((plans[0]?.groceryListJson as unknown[]).length).toBeGreaterThan(0);
  });

  it("es idempotente: volver a abrir el home no duplica ni cambia el menú", async () => {
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId } });

    const first = await currentMealPlan(userId, profile);
    const second = await currentMealPlan(userId, profile);

    expect(first?.plans.map((plan) => plan.id)).toEqual(second?.plans.map((plan) => plan.id));
    expect(await prisma.mealPlan.count({ where: { decisionId } })).toBe(2);
  });

  it("toma la decisión aprobada aunque nadie la haya publicado todavía", async () => {
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId } });
    const current = await currentMealPlan(userId, profile);

    expect(current?.decision.id).toBe(decisionId);
    expect(current?.decision.publishedAt).toBeNull();
    expect(current?.plans).toHaveLength(2);
  });

  it("sin decisión no hay plan, y el home lo puede decir sin romperse", async () => {
    const otherId = randomUUID();
    await prisma.user.create({
      data: { id: otherId, email: `menu-${otherId}@coachy.invalid`, role: "ATHLETE" },
    });
    const profile = await prisma.profile.create({
      data: {
        userId: otherId,
        displayName: "Atleta sin historial",
        sex: "FEMALE",
        heightCm: "165.0",
        mealsPerDay: 4,
        onboardingCompletedAt: new Date(),
      },
    });

    expect(await currentMealPlan(otherId, profile)).toBeNull();

    await prisma.user.deleteMany({ where: { id: otherId } });
  });
});
