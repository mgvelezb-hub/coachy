import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { recentHealthDays, upsertHealthDays } from "@/lib/health/db";
import { daysFromPayload, healthIngestSchema } from "@/lib/health/schema";

/**
 * Los días del reloj, ahora desde la app nativa (Fase N5).
 *
 * Mismo cuerpo y mismas reglas que `/api/health/ingest` — el que armó el
 * Atajo de iOS — pero autenticado con la sesión del atleta en vez del token
 * por atleta. La app lee HealthKit y manda aquí; nadie tiene que configurar
 * un atajo a mano.
 *
 * El endpoint viejo se queda vivo: los teléfonos que ya tienen el atajo
 * armado siguen funcionando, y ambos escriben en la misma tabla con la misma
 * idempotencia por `(atleta, día)`.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  return NextResponse.json({ dias: await recentHealthDays(user.id) });
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const parsed = healthIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "datos fuera de rango", detalles: parsed.error.issues.slice(0, 5) },
      { status: 422 },
    );
  }

  const days = daysFromPayload(parsed.data);
  const saved = await upsertHealthDays(user.id, days);

  return NextResponse.json({ ok: true, guardados: saved, fechas: days.map((day) => day.date) });
}
