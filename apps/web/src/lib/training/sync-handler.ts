import "server-only";

import { persistSession } from "@/lib/training/session-write";
import { syncBatchSchema } from "@/lib/validation/training";

/**
 * Lógica compartida de la cola de sincronización del modo gimnasio.
 *
 * La usan dos routes: `POST /api/training/sync` (auth por cookies, la web) y
 * `POST /api/v1/training/sync` (auth Bearer, la futura app nativa). La única
 * diferencia entre ambos es cómo llegan a `userId` — de ahí en adelante el
 * contrato es idéntico, así que vive aquí una sola vez.
 */

export type SyncSessionResult =
  | {
      workoutId: string;
      ok: true;
      prs: Array<{ exerciseName: string; weightKg: number; previousKg: number | null }>;
      volumeKg: number;
      cambios: unknown;
    }
  | { workoutId: string; ok: false; error: string };

export type SyncOutcome =
  | { status: 400; body: { error: string } }
  | { status: 422; body: { error: string; detalles: unknown } }
  | { status: 200; body: { resultados: SyncSessionResult[] } };

/**
 * Valida el batch y persiste cada sesión. Recibe el JSON ya parseado
 * (`bodyJson`): el error de "cuerpo inválido" por un `request.json()` que
 * truena sigue siendo responsabilidad de cada route, porque ocurre antes de
 * tener un `bodyJson` que pasar aquí.
 */
export async function runSyncBatch(userId: string, bodyJson: unknown): Promise<SyncOutcome> {
  const parsed = syncBatchSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return {
      status: 422,
      body: { error: "datos fuera de rango", detalles: parsed.error.issues.slice(0, 5) },
    };
  }

  const results: SyncSessionResult[] = [];
  for (const session of parsed.data.sessions) {
    const saved = await persistSession(userId, session);
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

  return { status: 200, body: { resultados: results } };
}
