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

export interface MaterializeOptions {
  /** El peso más reciente del historial; el del perfil puede estar viejo. */
  latestWeightKg?: number | null;
  /**
   * Si ya hay menús guardados para esta decisión, `false` los deja intactos
   * (el caso de `ensureMealPlans`: solo rellena lo que nunca se generó) y
   * `true` los pisa con lo recién calculado (el caso de "regenerar mi menú
   * ahora": la persona pidió explícitamente que sus alimentos de hoy entren
   * YA, no hasta el siguiente check-in).
   */
  overwrite: boolean;
}

/**
 * `distribute` + `generateMenu` sobre los macros ya decididos, y guarda el
 * resultado.
 *
 * Único lugar donde se corre el generador de menús a partir de una
 * `Decision` ya guardada — `ensureMealPlans` (primera vez, nunca pisa) y
 * `POST /api/v1/nutricion/regenerar-menu` (a demanda, sí pisa) son los dos
 * llamadores, y comparten esta función para no tener la lógica del motor
 * duplicada con la oportunidad de que un día se desincronicen.
 *
 * Los MACROS no se tocan: `targets` sale de la `Decision` tal cual está
 * guardada. Lo único que cambia con `toEngineProfile(profile)` son las
 * preferencias con las que se elige QUÉ alimentos cumplen esos números —
 * exclusiones, favoritos, presupuesto, dieta, suplementos, tiempo de cocina.
 *
 * La MISMA semilla (`decision.menuSeed` o su respaldo por fecha) entra
 * siempre: mismo seed + catálogo filtrado por las preferencias de hoy es lo
 * que hace que regenerar cambie solo lo necesario y no entregue un menú
 * irreconocible.
 */
export async function materializeMealPlans(
  decision: Decision & { checkIn?: { date: Date } | null },
  profile: Profile,
  options: MaterializeOptions,
): Promise<MealPlan[]> {
  const engineProfile = toEngineProfile(profile, options.latestWeightKg ?? null);
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

    const data = {
      mealsJson: menu.meals as unknown as Prisma.InputJsonValue,
      equivalencesJson: equivalences as unknown as Prisma.InputJsonValue,
      groceryListJson: plan.shoppingList as unknown as Prisma.InputJsonValue,
    };

    saved.push(
      await prisma.mealPlan.upsert({
        where: { decisionId_menuNumber: { decisionId: decision.id, menuNumber: menu.id } },
        create: { decisionId: decision.id, menuNumber: menu.id, ...data },
        update: options.overwrite ? data : {},
      }),
    );
  }

  return saved;
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
 * `overwrite: false`: si ya hay menús (aunque vengan de otra fuente), esta
 * función nunca los toca — para reemplazarlos a propósito está
 * `materializeMealPlans` directo, con `overwrite: true`.
 */
export async function ensureMealPlans(
  decision: Decision & { checkIn?: { date: Date } | null },
  profile: Profile,
  latestWeightKg?: number | null,
): Promise<MealPlan[]> {
  const existing = await mealPlansOf(decision.id);
  if (existing.length > 0) return existing;

  return materializeMealPlans(decision, profile, { overwrite: false, latestWeightKg });
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
