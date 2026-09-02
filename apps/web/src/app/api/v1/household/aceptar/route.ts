import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { HouseholdError, aceptarInvitacion } from "@/lib/household";

/**
 * `POST /api/v1/household/aceptar` — acepta una invitación con el código que
 * la otra persona compartió fuera de la app. Deja el vínculo ACTIVO.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().trim().min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "código inválido" }, { status: 422 });
  }

  try {
    const vinculo = await aceptarInvitacion(user.id, parsed.data.code);
    return NextResponse.json({ vinculo });
  } catch (error) {
    if (error instanceof HouseholdError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
