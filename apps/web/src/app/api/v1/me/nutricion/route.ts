import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { prisma } from "@/lib/prisma";

/**
 * `PATCH /api/v1/me/nutricion` — las preferencias que cambian el menú.
 *
 * Hoy solo el presupuesto. Cambiarlo NO regenera los menús ya publicados: el
 * menú de esta semana ya se compró, y rehacerlo a media semana obligaría a
 * tirar comida. El siguiente check-in lo arma con el nivel nuevo.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  budget: z.enum(["BAJO", "MEDIO", "ALTO"]),
});

export async function PATCH(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();
  if (!user.profile) {
    return NextResponse.json({ error: "onboarding incompleto" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "presupuesto inválido" }, { status: 422 });
  }

  const profile = await prisma.profile.update({
    where: { userId: user.id },
    data: { budget: parsed.data.budget },
    select: { budget: true },
  });

  return NextResponse.json({ budget: profile.budget });
}
