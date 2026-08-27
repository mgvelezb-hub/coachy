import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { goalReferenceUrls, goalStatusFor } from "@/lib/coachy/goal";

/**
 * `GET /api/v1/goal` — "Rumbo a tu objetivo" para la app nativa: el mismo
 * estado que pinta la tarjeta de `/app/historial` (`goalStatusFor`) más las
 * referencias con URL firmada de `/app/objetivo` (`goalReferenceUrls`).
 *
 * Ambas funciones ya son las que usa la web — no se reimplementa firmado ni
 * caché aquí, solo se empaquetan para el cliente Bearer.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  if (!user.profile?.onboardingCompletedAt) {
    return NextResponse.json({ error: "onboarding incompleto" }, { status: 403 });
  }
  const profile = user.profile;

  let status: Awaited<ReturnType<typeof goalStatusFor>>;
  try {
    status = await goalStatusFor(user.id, profile);
  } catch (error) {
    console.error("[coachy] no se pudo calcular el objetivo (api)", error);
    return NextResponse.json({ error: "no se pudo calcular el objetivo" }, { status: 500 });
  }

  const references = (await goalReferenceUrls(user.id)).map(({ view, url }) => ({ view, url }));

  return NextResponse.json({ status, references });
}
