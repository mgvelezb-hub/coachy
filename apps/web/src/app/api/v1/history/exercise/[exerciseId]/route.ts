import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { exerciseProgress } from "@/lib/training/view";

/**
 * `GET /api/v1/history/exercise/:exerciseId` — la tendencia semanal de un
 * ejercicio: peso tope y volumen, semana a semana, más el récord vigente para
 * tener contra qué leerla.
 */

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ exerciseId: string }> },
): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const { exerciseId } = await params;
  const progreso = await exerciseProgress(user.id, exerciseId);
  if (!progreso) return NextResponse.json({ error: "no existe ese ejercicio" }, { status: 404 });

  return NextResponse.json(progreso);
}
