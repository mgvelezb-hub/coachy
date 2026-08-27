import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { personalRecordList, trainingHistory } from "@/lib/training/view";

/**
 * `GET /api/v1/history/training` — historial de sesiones entrenadas y récords
 * vigentes del atleta autenticado, para la app nativa. Ambos ya salen
 * aplanados (nada de `Decimal` ni `Date` crudos).
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const [sessions, records] = await Promise.all([
    trainingHistory(user.id),
    personalRecordList(user.id),
  ]);

  return NextResponse.json({ sessions, records });
}
