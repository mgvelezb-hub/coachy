import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { parseMealTimes } from "@/lib/coachy/horarios";
import { currentMealPlan, listaDeSuperDe } from "@/lib/coachy/menu";
import { parsePantry } from "@/lib/coachy/mapping";
import { toGroceries, toMenuView } from "@/lib/coachy/menu-view";

/**
 * `GET /api/v1/nutrition` — el plan de alimentación vigente del atleta, para
 * la app nativa. Mismo camino que la tarjeta "Tu alimentación" del home
 * (`currentMealPlan` + los mappers de `@/lib/coachy/menu-view`), así que
 * ambos frentes ven exactamente el mismo menú.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  if (!user.profile?.onboardingCompletedAt) {
    return NextResponse.json({ error: "onboarding incompleto" }, { status: 403 });
  }
  const profile = user.profile;

  const nutrition = await currentMealPlan(user.id, profile).catch((error) => {
    console.error("[coachy] no se pudo cargar la alimentación (api)", error);
    return null;
  });

  const horarios = parseMealTimes(profile.mealTimes);
  const menus =
    nutrition?.plans.map((plan) => toMenuView(plan.menuNumber, plan.mealsJson, horarios)) ?? [];

  // La lista de súper depende de qué menús se van a cocinar de verdad: los dos
  // repartidos en la semana, o uno solo los siete días.
  const groceries = nutrition
    ? listaDeSuperDe(nutrition.plans, profile.menuPreference, parsePantry(profile.pantry))
    : [];

  return NextResponse.json({
    decision: nutrition
      ? {
          id: nutrition.decision.id,
          phase: nutrition.decision.phase,
          kcal: nutrition.decision.kcal,
          proteinG: nutrition.decision.proteinG,
          carbsG: nutrition.decision.carbsG,
          fatG: nutrition.decision.fatG,
        }
      : null,
    menus,
    groceries,
    /** `AMBOS` | `MENU_1` | `MENU_2`: cuál se está cocinando. */
    menuPreference: profile.menuPreference,
    /** Los horarios propios que ya pisan la sugerencia del motor. */
    horarios,
    materialized: nutrition?.materialized ?? false,
  });
}
