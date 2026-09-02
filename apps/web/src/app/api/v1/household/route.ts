import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { vinculoDe } from "@/lib/household";

/**
 * `GET /api/v1/household` — el vínculo vigente de la cuenta (ACTIVO o
 * PENDIENTE), o `null` si no tiene ninguno.
 *
 * Solo BASE por ahora: esta ruta no comparte nada, solo dice si existe un
 * vínculo y con quién (correo enmascarado). Nada de esto tiene UI todavía.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const vinculo = await vinculoDe(user.id);
  return NextResponse.json({ vinculo });
}
