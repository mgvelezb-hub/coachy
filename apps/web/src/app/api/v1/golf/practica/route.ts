import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { saveGolfPractica } from "@/lib/golf-db";
import { golfPracticaSchema } from "@/lib/golf-schema";

/**
 * `POST /api/v1/golf/practica` — registra una sesión de práctica (range,
 * juego corto o putting).
 *
 * Separada de `/ronda` porque mejora cosas distintas y porque el balance
 * entre tipos es justo el dato que enseña el desbalance clásico: el juego
 * corto y el putting concentran la mayoría de los golpes de una ronda
 * amateur y reciben una fracción de las horas de práctica frente al range
 * (ver el docblock de `lib/golf.ts`).
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

  const parsed = golfPracticaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "datos fuera de rango", detalles: parsed.error.issues.slice(0, 5) },
      { status: 422 },
    );
  }

  const practica = await saveGolfPractica(user.id, parsed.data);

  return NextResponse.json({ ok: true, practica }, { status: 201 });
}
