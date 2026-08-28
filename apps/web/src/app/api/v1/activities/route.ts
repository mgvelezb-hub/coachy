import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { recentActivities, saveActivities } from "@/lib/activity/db";
import { activitiesIngestSchema } from "@/lib/activity/schema";

/**
 * `/api/v1/activities` — sesiones de disciplinas fuera del modo gimnasio de
 * pesas (natación, box, squash, CrossFit, funcional, cardio).
 *
 * Registro, no prescripción: esta fase no genera rutina para estas
 * disciplinas, solo hace que la sesión exista, se vea y cuente para la
 * racha. Mismo patrón que `/api/v1/health`: auth por Bearer, `userId`
 * siempre del token (Prisma corre con BYPASSRLS, así que cada query filtra
 * a mano), lote acotado, e idempotencia por `externalId` para lo que llega
 * de HealthKit (ver `saveActivities` en `@/lib/activity/db`).
 */

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;

/** Límite de la página: `DEFAULT_LIMIT` si no viene, acotado a `MAX_LIMIT`. */
function parseLimit(searchParams: URLSearchParams): number {
  const raw = searchParams.get("limit");
  if (!raw) return DEFAULT_LIMIT;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return DEFAULT_LIMIT;

  return Math.min(value, MAX_LIMIT);
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams);

  return NextResponse.json({ actividades: await recentActivities(user.id, limit) });
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

  const parsed = activitiesIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "datos fuera de rango", detalles: parsed.error.issues.slice(0, 5) },
      { status: 422 },
    );
  }

  const guardadas = await saveActivities(user.id, parsed.data.activities);

  return NextResponse.json({ ok: true, guardadas });
}
