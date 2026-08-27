import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { currentMealPlan } from "@/lib/coachy/menu";
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

  const menus = nutrition?.plans.map((plan) => toMenuView(plan.menuNumber, plan.mealsJson)) ?? [];
  const groceries = nutrition?.plans[0] ? toGroceries(nutrition.plans[0].groceryListJson) : [];

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
    materialized: nutrition?.materialized ?? false,
  });
}
