import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { sessionDetail } from "@/lib/training/view";

/**
 * `GET /api/v1/history/training/:workoutId` — una sesión, serie por serie,
 * con lo que pedía el plan al lado de lo que salió.
 *
 * Vive aparte de `/history/training` (que devuelve la lista) porque es el
 * zoom: la lista contesta "qué entrené" y esto contesta "cómo me fue en la
 * serie 4". Traer el detalle de doce sesiones para enseñar una sería pagar por
 * once que nadie abrió.
 */

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workoutId: string }> },
): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const { workoutId } = await params;
  const detalle = await sessionDetail(user.id, workoutId);
  if (!detalle) return NextResponse.json({ error: "no existe esa sesión" }, { status: 404 });

  return NextResponse.json(detalle);
}
