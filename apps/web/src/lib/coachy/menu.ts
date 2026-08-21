import "server-only";

import type { MealPlan, Profile } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { generateMenu } from "engine";

import { toEngineProfile } from "@/lib/coachy/mapping";
import type { EngineDecision } from "@/lib/engine-types";
import { prisma } from "@/lib/prisma";

/**
 * Menús de la decisión.
 *
 * Cadencias de la metodología §2: el **refresco de menú** ocurre cada ~2 semanas
 * (misma fase, mismos macros, alimentos distintos) y el **cambio de fase** es
 * mensual y por señal. El motor ya resuelve las dos: `menuSeed` cambia cada
 * quincena y `phase` cambia cuando toca. Aquí solo se materializan.
 *
 * El generador es determinista: con la misma semilla salen los mismos menús, así
 * que regenerar no sorprende al atleta a media semana.
 */

export interface SyncMenuOptions {
  /** La fase cambió respecto a la decisión anterior. */
  phaseChanged: boolean;
  /** El motor movió la semilla: toca quincena. */
  menuSeedChanged: boolean;
  /** Peso más reciente del historial; el del perfil puede estar viejo. */
  latestWeightKg?: number | null;
}

export async function syncMealPlans(
  decisionId: string,
  profile: Profile,
  engineDecision: EngineDecision,
  options: SyncMenuOptions,
): Promise<MealPlan[]> {
  const existing = await prisma.mealPlan.findMany({
    where: { decisionId },
    orderBy: { menuNumber: "asc" },
  });

  const needsMenu =
    existing.length === 0 ||
    options.phaseChanged ||
    options.menuSeedChanged ||
    engineDecision.menuRefresh;

  if (!needsMenu) return existing;

  const engineProfile = toEngineProfile(profile, options.latestWeightKg ?? null);
  const plan = generateMenu(
    engineDecision.meals,
    engineProfile,
    undefined,
    engineDecision.menuSeed,
    { phase: engineDecision.phase },
  );

  const saved: MealPlan[] = [];

  for (const menu of plan.menus) {
    const equivalences = menu.meals.flatMap((meal) =>
      meal.equivalences.map((equivalence) => ({ slot: meal.slot, ...equivalence })),
    );

    const data = {
      mealsJson: menu.meals as unknown as Prisma.InputJsonValue,
      equivalencesJson: equivalences as unknown as Prisma.InputJsonValue,
      groceryListJson: plan.shoppingList as unknown as Prisma.InputJsonValue,
    };

    saved.push(
      await prisma.mealPlan.upsert({
        where: { decisionId_menuNumber: { decisionId, menuNumber: menu.id } },
        create: { decisionId, menuNumber: menu.id, ...data },
        update: data,
      }),
    );
  }

  return saved;
}
