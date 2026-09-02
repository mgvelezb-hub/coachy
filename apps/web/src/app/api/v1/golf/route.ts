import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { golfRondasParaAgregados, recentGolfPracticas, recentGolfRondas } from "@/lib/golf-db";
import { calcularAgregadosGolf } from "@/lib/golf";

/**
 * `GET /api/v1/golf` — últimas 20 rondas, prácticas de los últimos 30 días, y
 * los agregados de `lib/golf.ts` (score vs par, GIR%, FIR%, putts, castigos,
 * tendencia, diferencial y balance de práctica por tipo).
 *
 * Los agregados se calculan sobre una ventana más amplia que las 20 rondas
 * que ve la pantalla (ver `golfRondasParaAgregados`): la tendencia y el
 * diferencial miran hacia atrás más de lo que la lista visible alcanza a
 * mostrar.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const [rondas, practicas, rondasParaAgregados] = await Promise.all([
    recentGolfRondas(user.id, 20),
    recentGolfPracticas(user.id, 30),
    golfRondasParaAgregados(user.id),
  ]);

  const agregados = calcularAgregadosGolf(rondasParaAgregados, practicas);

  return NextResponse.json({ rondas, practicas, agregados });
}
