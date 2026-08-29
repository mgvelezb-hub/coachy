import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { prisma } from "@/lib/prisma";

/**
 * `PATCH /api/v1/me/checkin` — cuándo cierra su semana esta persona.
 *
 * El recordatorio lo programa el teléfono (una notificación local, sin
 * servidor de por medio), pero el día y la hora se guardan aquí para que
 * sobrevivan a un cambio de teléfono y para que el análisis sepa qué día
 * espera el cierre.
 *
 * `null` en cualquiera de los dos apaga esa parte: sin día no hay cadencia
 * declarada, sin hora no hay recordatorio.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  /** 0 = domingo, 6 = sábado. */
  weekday: z.number().int().min(0).max(6).nullable(),
  /** Hora local, 0-23. */
  hour: z.number().int().min(0).max(23).nullable(),
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
    return NextResponse.json(
      { error: "datos inválidos", detalles: parsed.error.issues.slice(0, 3) },
      { status: 422 },
    );
  }

  const profile = await prisma.profile.update({
    where: { userId: user.id },
    data: { checkinWeekday: parsed.data.weekday, checkinHour: parsed.data.hour },
    select: { checkinWeekday: true, checkinHour: true },
  });

  return NextResponse.json({ checkinWeekday: profile.checkinWeekday, checkinHour: profile.checkinHour });
}
