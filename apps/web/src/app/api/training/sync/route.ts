import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { persistSession } from "@/lib/training/session-write";
import { syncBatchSchema } from "@/lib/validation/training";

/**
 * Cola de sincronización del modo gimnasio.
 *
 * El teléfono escribe primero en IndexedDB y sube aquí lo que tenga pendiente
 * cuando hay red. Es idempotente por `(workoutId, clientId)`, así que la cola
 * puede reintentar sin duplicar una sola serie.
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

  const parsed = syncBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "datos fuera de rango", detalles: parsed.error.issues.slice(0, 5) },
      { status: 422 },
    );
  }

  const results = [];
  for (const session of parsed.data.sessions) {
    const saved = await persistSession(user.id, session);
    results.push(
      saved
        ? {
            workoutId: session.workoutId,
            ok: true,
            prs: saved.prs,
            volumeKg: saved.volumeKg,
            cambios: saved.substitutions,
          }
        : { workoutId: session.workoutId, ok: false, error: "sesión no encontrada" },
    );
  }

  return NextResponse.json({ resultados: results });
}
