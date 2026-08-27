import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { resolveWeekReference } from "@/lib/api/date-param";
import { weekView } from "@/lib/training/view";

/**
 * `GET /api/v1/training/week` — la semana entera del modo gimnasio, para
 * cachear offline en la app nativa (videos firmados incluidos).
 *
 * `WeekView` ya sale serializable de `weekView()` (fechas como ISO string,
 * nada de `Decimal` ni `Date` crudos), así que se manda tal cual.
 *
 * `date` (`YYYY-MM-DD`) es opcional: sin él, la semana es la de hoy. Con un
 * valor que no es fecha ISO, 400.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();
  if (!user.profile?.onboardingCompletedAt) {
    return NextResponse.json({ error: "onboarding incompleto" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const reference = resolveWeekReference(searchParams.get("date"));
  if (!reference.ok) {
    return NextResponse.json({ error: "fecha inválida" }, { status: 400 });
  }

  const week = await weekView(user.id, user.profile, reference.date);
  return NextResponse.json(week);
}
