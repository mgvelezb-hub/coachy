import "server-only";

import type { Decision, MealPlan, Profile } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { distribute, generateMenu } from "engine";

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

/**
 * Fibra por defecto cuando la decisión se guardó sin ella (el importador de
 * historial no la trae). El motor la necesita para repartir el menú.
 */
const DEFAULT_FIBER_G = 25;

/** Semilla quincenal derivada de la fecha, para decisiones sin `menuSeed`. */
export function seedFromDate(date: Date): number {
  return Math.floor(date.getTime() / (14 * 86_400_000));
}

/** Los menús guardados de una decisión, del 1 al 2. */
export async function mealPlansOf(decisionId: string): Promise<MealPlan[]> {
  return prisma.mealPlan.findMany({ where: { decisionId }, orderBy: { menuNumber: "asc" } });
}

/**
 * Menús de una decisión que nació sin ellos.
 *
 * `syncMealPlans` corre dentro de `runCoachy`, así que toda decisión que llegó
 * por otro camino — el importador de historial, por ejemplo — quedó con sus
 * números pero sin menú, y la atleta abre la app y no ve nada de nutrición.
 * Aquí se materializan **a demanda**, con el mismo patrón que la rutina:
 * la primera vez que alguien abre el home, no un cron.
 *
 * El motor sigue mandando: los gramos salen de `distribute` + `generateMenu`
 * sobre los macros que ya estaban guardados. Aquí no se decide ningún número.
 */
export async function ensureMealPlans(
  decision: Decision & { checkIn?: { date: Date } | null },
  profile: Profile,
  latestWeightKg?: number | null,
): Promise<MealPlan[]> {
  const existing = await mealPlansOf(decision.id);
  if (existing.length > 0) return existing;

  const engineProfile = toEngineProfile(profile, latestWeightKg ?? null);
  const targets = {
    kcal: decision.kcal,
    proteinG: decision.proteinG,
    fatG: decision.fatG,
    carbG: decision.carbsG,
    fiberG: decision.fiberG ?? DEFAULT_FIBER_G,
  };

  const slots = distribute(targets, engineProfile, decision.phase as EngineDecision["phase"]);
  const seed = decision.menuSeed ?? seedFromDate(decision.checkIn?.date ?? decision.createdAt);

  const plan = generateMenu(slots, engineProfile, undefined, seed, {
    phase: decision.phase as EngineDecision["phase"],
  });

  const saved: MealPlan[] = [];

  for (const menu of plan.menus) {
    const equivalences = menu.meals.flatMap((meal) =>
      meal.equivalences.map((equivalence) => ({ slot: meal.slot, ...equivalence })),
    );

    saved.push(
      await prisma.mealPlan.upsert({
        where: { decisionId_menuNumber: { decisionId: decision.id, menuNumber: menu.id } },
        create: {
          decisionId: decision.id,
          menuNumber: menu.id,
          mealsJson: menu.meals as unknown as Prisma.InputJsonValue,
          equivalencesJson: equivalences as unknown as Prisma.InputJsonValue,
          groceryListJson: plan.shoppingList as unknown as Prisma.InputJsonValue,
        },
        update: {},
      }),
    );
  }

  return saved;
}

export type CurrentMealPlan = {
  decision: Decision;
  plans: MealPlan[];
  /** El menú se acaba de materializar en este render. */
  materialized: boolean;
};

/**
 * El plan de alimentación vigente del atleta, materializándolo si hace falta.
 *
 * Prefiere lo publicado; si nada se publicó todavía pero hay una decisión
 * aprobada, esa manda — es exactamente el caso del historial importado, donde
 * la decisión existe desde el día uno y el menú nunca se generó.
 */
export async function currentMealPlan(
  userId: string,
  profile: Profile,
): Promise<CurrentMealPlan | null> {
  const decision =
    (await prisma.decision.findFirst({
      where: { userId, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      include: { checkIn: { select: { date: true } } },
    })) ??
    (await prisma.decision.findFirst({
      where: { userId, status: { in: ["APROBADA", "CORREGIDA"] } },
      orderBy: { checkIn: { date: "desc" } },
      include: { checkIn: { select: { date: true } } },
    }));

  if (decision === null) return null;

  const existing = await mealPlansOf(decision.id);
  if (existing.length > 0) return { decision, plans: existing, materialized: false };

  const latest = await prisma.checkIn.findFirst({
    where: { userId, weightKg: { not: null } },
    orderBy: { date: "desc" },
    select: { weightKg: true },
  });

  try {
    const plans = await ensureMealPlans(
      decision,
      profile,
      latest?.weightKg === null || latest?.weightKg === undefined ? null : Number(latest.weightKg),
    );
    return { decision, plans, materialized: plans.length > 0 };
  } catch (error) {
    // Un perfil incompleto no puede tumbar el home: la tarjeta lo dice y ya.
    console.error("[coachy] no se pudo materializar el menú", error);
    return { decision, plans: [], materialized: false };
  }
}
