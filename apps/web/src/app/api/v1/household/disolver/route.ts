import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { HouseholdError, disolver } from "@/lib/household";

/**
 * `POST /api/v1/household/disolver` — termina el vínculo vigente de la
 * cuenta. Cualquiera de los dos —quien invitó o quien aceptó— puede hacerlo.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  try {
    await disolver(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HouseholdError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
