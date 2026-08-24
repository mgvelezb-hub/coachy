/**
 * Materializa el menú vigente de cada atleta que tiene decisión aprobada pero
 * ningún `meal_plan`.
 *
 * Es el mismo camino que corre el home a demanda; esto solo lo dispara sin
 * esperar a que alguien abra la app. Idempotente: si el menú ya existe, no
 * toca nada.
 *
 *   set -a && . ./.env.local && set +a
 *   pnpm exec tsx --conditions=react-server scripts/materialize-meal-plans.mts
 */

import { currentMealPlan } from "@/lib/coachy/menu";
import { prisma } from "@/lib/prisma";

async function main(): Promise<void> {
  const before = await prisma.mealPlan.count();
  console.log(`meal_plans antes: ${before}`);

  const profiles = await prisma.profile.findMany({ orderBy: { createdAt: "asc" } });

  for (const profile of profiles) {
    const result = await currentMealPlan(profile.userId, profile);
    if (result === null) {
      console.log(`- ${profile.userId}: sin decisión aprobada, nada que materializar`);
      continue;
    }
    console.log(
      `- ${profile.userId}: decisión ${result.decision.phase} ${result.decision.kcal} kcal → ` +
        `${result.plans.length} menús${result.materialized ? " (materializados ahora)" : " (ya existían)"}`,
    );
  }

  console.log(`meal_plans después: ${await prisma.mealPlan.count()}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
