import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { saveGolfRonda } from "@/lib/golf-db";
import { golfRondaSchema } from "@/lib/golf-schema";

/**
 * `POST /api/v1/golf/ronda` — registra una ronda jugada.
 *
 * Registro, no prescripción: esta fase no arma un plan de golf, solo hace
 * que la ronda exista y alimente los agregados de `lib/golf.ts` (GIR%, FIR%,
 * putts, castigos, tendencia, diferencial). Mismo patrón que
 * `/api/v1/activities`: auth por Bearer, `userId` siempre del token.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const parsed = golfRondaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "datos fuera de rango", detalles: parsed.error.issues.slice(0, 5) },
      { status: 422 },
    );
  }

  const ronda = await saveGolfRonda(user.id, parsed.data);

  return NextResponse.json({ ok: true, ronda }, { status: 201 });
}
