import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { todayCard } from "@/lib/training/view";

/**
 * `GET /api/v1/training/today` — la tarjeta "Hoy" del home, para la app
 * nativa. Espejo de cómo `src/app/app/page.tsx` arma `today` para
 * `todayCard()`: mediodía en vez de la hora exacta, para no cruzar de día por
 * un redondeo cerca de medianoche.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();
  if (!user.profile?.onboardingCompletedAt) {
    return NextResponse.json({ error: "onboarding incompleto" }, { status: 403 });
  }

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const card = await todayCard(user.id, user.profile, today);
  return NextResponse.json({ today: card });
}
