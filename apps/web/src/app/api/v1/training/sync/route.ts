import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { runSyncBatch } from "@/lib/training/sync-handler";

/**
 * `POST /api/v1/training/sync` — la misma cola de sincronización del modo
 * gimnasio que `POST /api/training/sync`, para la app nativa.
 *
 * Mismo contrato exacto (mismos status, mismos mensajes, misma idempotencia
 * por `(workoutId, clientId)`): la única diferencia es que la sesión llega por
 * `Authorization: Bearer <jwt>` en vez de por cookie. Ambos routes comparten
 * la validación y persistencia en `runSyncBatch`.
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

  const outcome = await runSyncBatch(user.id, body);
  return NextResponse.json(outcome.body, { status: outcome.status });
}
