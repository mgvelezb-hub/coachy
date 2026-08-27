import NetInfo from "@react-native-community/netinfo";

import { ApiError, postTrainingSync, type SyncSessionResult } from "@/lib/api";
import {
  bumpAttempt,
  countPendingSessions,
  listPendingSessions,
  markSynced,
} from "@/lib/training-db";

/**
 * Cola de sincronización del modo gimnasio.
 *
 * Nada de esto se dispara solo, sin que la app esté abierta: Expo Go no tiene
 * Background Sync del SO (a diferencia del service worker de la web, que sí
 * puede despertar con la app cerrada — ver `apps/web/src/lib/training/
 * offline.ts`). Aquí el sync corre mientras la app está en primer plano, y es
 * suficiente porque la atleta abre el teléfono al salir del gimnasio, no
 * mientras está adentro sin señal.
 *
 * Triggers reales (todos definidos fuera de este módulo, que solo expone las
 * funciones):
 *  1. Al montar la app con sesión — hook en el layout de tabs.
 *  2. Al recuperar red — `NetInfo.addEventListener`.
 *  3. Después de cada captura, si hay red — la pantalla de gimnasio llama
 *     `syncNow()` tras cada `upsertPendingSession`.
 */

const MAX_BACKOFF_MS = 5 * 60 * 1000;
const BATCH_SIZE = 20;

/** Backoff en memoria: no sobrevive a cerrar la app, y está bien — al abrirla
 * de nuevo el trigger de montaje vuelve a intentar desde cero. */
const backoffUntil = new Map<string, number>();

function backoffFor(attempts: number): number {
  return Math.min(2 ** attempts * 1000, MAX_BACKOFF_MS);
}

export type SyncResult = { sent: number; pending: number; prs: string[]; failed: number };

let inFlight: Promise<SyncResult> | null = null;

/**
 * Sube lo que quepa de la cola (máx 20 sesiones por lote, el tope de
 * `syncBatchSchema`). Nunca lanza al UI: todo error de red o del servidor se
 * queda registrado en la fila pendiente vía `bumpAttempt`, y la pantalla lee
 * el conteo, no la excepción.
 */
export async function syncNow(): Promise<SyncResult> {
  // Dos llamadas casi simultáneas (montaje + evento de red, por ejemplo) no
  // deben mandar el mismo batch dos veces: la segunda espera a la primera.
  if (inFlight) return inFlight;

  inFlight = runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<SyncResult> {
  const now = Date.now();
  const all = await listPendingSessions();
  const due = all.filter((session) => (backoffUntil.get(session.workoutId) ?? 0) <= now);
  const batch = due.slice(0, BATCH_SIZE);

  if (batch.length === 0) {
    return { sent: 0, pending: all.length, prs: [], failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const prs: string[] = [];

  try {
    const response = await postTrainingSync(batch.map((session) => session.payload));

    for (const result of response.resultados) {
      if (result.ok) {
        await markSynced(result.workoutId);
        backoffUntil.delete(result.workoutId);
        sent += 1;
        for (const pr of result.prs) prs.push(pr.exerciseName);
      } else {
        await handleFailure(result, batch);
        failed += 1;
      }
    }
  } catch (error) {
    // Red caída o el servidor no respondió: todo el lote se reprograma.
    const message = error instanceof ApiError ? error.message : "sin conexión";
    for (const session of batch) {
      await bumpAttempt(session.workoutId, message);
      backoffUntil.set(session.workoutId, Date.now() + backoffFor(session.attempts + 1));
    }
    failed += batch.length;
  }

  const pending = await countPendingSessions();
  return { sent, pending, prs, failed };
}

async function handleFailure(
  result: Extract<SyncSessionResult, { ok: false }>,
  batch: Array<{ workoutId: string; attempts: number }>,
): Promise<void> {
  await bumpAttempt(result.workoutId, result.error);
  const attempts = batch.find((session) => session.workoutId === result.workoutId)?.attempts ?? 0;
  backoffUntil.set(result.workoutId, Date.now() + backoffFor(attempts + 1));
}

// ---------------------------------------------------------------------------
// Indicador para la UI
// ---------------------------------------------------------------------------

type Listener = (count: number) => void;
const listeners = new Set<Listener>();
let lastCount = 0;

/** Suscribe un listener al conteo de sesiones pendientes; devuelve unsubscribe. */
export function subscribePendingCount(listener: Listener): () => void {
  listeners.add(listener);
  listener(lastCount);
  return () => listeners.delete(listener);
}

async function refreshPendingCount(): Promise<number> {
  const count = await countPendingSessions();
  lastCount = count;
  for (const listener of listeners) listener(count);
  return count;
}

/** Sincroniza y notifica a la UI el conteo resultante. Nunca lanza. */
export async function syncAndNotify(): Promise<SyncResult> {
  const result = await syncNow();
  await refreshPendingCount();
  return result;
}

// ---------------------------------------------------------------------------
// Triggers de red
// ---------------------------------------------------------------------------

let netUnsubscribe: (() => void) | null = null;

/**
 * Arranca el listener de red que dispara `syncAndNotify()` al recuperar
 * conexión. Idempotente: llamarlo dos veces no duplica el listener.
 */
export function startNetworkSync(): () => void {
  if (netUnsubscribe) return netUnsubscribe;

  let wasOffline = false;
  netUnsubscribe = NetInfo.addEventListener((state) => {
    const online = Boolean(state.isConnected) && state.isInternetReachable !== false;
    if (online && wasOffline) void syncAndNotify();
    wasOffline = !online;
  });

  const stop = netUnsubscribe;
  return () => {
    stop();
    netUnsubscribe = null;
  };
}

/** true si, hasta donde sabe el teléfono, hay internet ahora mismo. */
export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

// Se expone para que la pantalla pueda refrescar el badge sin esperar un ciclo
// de sync (por ejemplo justo después de un `upsertPendingSession`).
export { refreshPendingCount };
