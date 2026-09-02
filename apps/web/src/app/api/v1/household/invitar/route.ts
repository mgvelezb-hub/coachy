import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { HouseholdError, crearInvitacion } from "@/lib/household";

/**
 * `POST /api/v1/household/invitar` — genera (o reutiliza) el código de
 * invitación de 6 caracteres para vincular la cuenta con otra. Vigente 48 h.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  try {
    const { code, expiresAt } = await crearInvitacion(user.id);
    return NextResponse.json({ code, expiresAt });
  } catch (error) {
    if (error instanceof HouseholdError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
