import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { runSyncBatch } from "@/lib/training/sync-handler";

/**
 * Cola de sincronización del modo gimnasio.
 *
 * El teléfono escribe primero en IndexedDB y sube aquí lo que tenga pendiente
 * cuando hay red. Es idempotente por `(workoutId, clientId)`, así que la cola
 * puede reintentar sin duplicar una sola serie.
 *
 * La validación y persistencia viven en `runSyncBatch` (`@/lib/training/sync-handler`),
 * compartida con `POST /api/v1/training/sync` — ese route es igual a este salvo
 * por la auth, que ahí llega por Bearer en vez de por cookie.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const outcome = await runSyncBatch(user.id, body);
  return NextResponse.json(outcome.body, { status: outcome.status });
}
