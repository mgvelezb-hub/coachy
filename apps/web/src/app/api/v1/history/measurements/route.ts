import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { toChartSeries } from "@/lib/checkins";

/**
 * `GET /api/v1/history/measurements` — la serie de medidas del atleta
 * autenticado, para la gráfica de progreso de la app nativa. Mismos puntos
 * que alimentan la gráfica web (`toChartSeries`), ya aplanados.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const points = await toChartSeries(user.id);
  return NextResponse.json({ points });
}
