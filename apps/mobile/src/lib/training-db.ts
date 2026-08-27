import * as SQLite from "expo-sqlite";

import type { SessionSyncInput, WeekView } from "@/lib/api";

/**
 * Almacén local del modo gimnasio (Fase N4).
 *
 * En el gimnasio no hay señal — es un sótano de concreto. La semana ya tiene
 * que estar en el teléfono antes de entrar, y cada serie capturada se guarda
 * **local al instante**: sube sola cuando vuelve la red, nunca al revés.
 *
 * Es el mismo contrato que `apps/web/src/lib/training/offline.ts` (IndexedDB),
 * pero con SQLite porque aquí sí hay una base real disponible y no hace falta
 * el fallback a `localStorage` que la web necesita para navegadores viejos.
 */

const DB_NAME = "coachy-training.db";

export type PendingSession = {
  workoutId: string;
  payload: SessionSyncInput;
  updatedAt: number;
  attempts: number;
  lastError: string | null;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS week_cache (
          week_key TEXT PRIMARY KEY NOT NULL,
          payload TEXT NOT NULL,
          fetched_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pending_sessions (
          workout_id TEXT PRIMARY KEY NOT NULL,
          payload TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );
      `);
      return db;
    });
  }
  return dbPromise;
}

// --- Rutina de la semana ----------------------------------------------------

/** Guarda la semana para poder abrirla mañana sin red. */
export async function saveWeek(weekKey: string, week: WeekView): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO week_cache (week_key, payload, fetched_at) VALUES (?, ?, ?)",
    [weekKey, JSON.stringify(week), Date.now()],
  );
}

export async function getCachedWeek(weekKey: string): Promise<WeekView | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ payload: string }>(
    "SELECT payload FROM week_cache WHERE week_key = ?",
    [weekKey],
  );
  if (!row) return null;
  try {
    return JSON.parse(row.payload) as WeekView;
  } catch {
    return null;
  }
}

// --- Cola de sincronización -------------------------------------------------

/**
 * Crea o actualiza la sesión pendiente de un workout, in-place.
 *
 * No hay "agregar a la cola" serie por serie: el teléfono guarda el
 * `SessionSyncInput` completo de la sesión y lo reescribe conforme la atleta
 * captura. Es idempotente en el servidor (`upsert` por `clientId`), así que
 * reenviar el mismo payload entero cuantas veces haga falta no duplica nada.
 */
export async function upsertPendingSession(
  workoutId: string,
  payload: SessionSyncInput,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO pending_sessions (workout_id, payload, updated_at, attempts, last_error)
     VALUES (?, ?, ?, 0, NULL)
     ON CONFLICT(workout_id) DO UPDATE SET
       payload = excluded.payload,
       updated_at = excluded.updated_at`,
    [workoutId, JSON.stringify(payload), Date.now()],
  );
}

export async function listPendingSessions(): Promise<PendingSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    workout_id: string;
    payload: string;
    updated_at: number;
    attempts: number;
    last_error: string | null;
  }>("SELECT workout_id, payload, updated_at, attempts, last_error FROM pending_sessions ORDER BY updated_at ASC");

  const sessions: PendingSession[] = [];
  for (const row of rows) {
    try {
      sessions.push({
        workoutId: row.workout_id,
        payload: JSON.parse(row.payload) as SessionSyncInput,
        updatedAt: row.updated_at,
        attempts: row.attempts,
        lastError: row.last_error,
      });
    } catch {
      // Fila corrupta: no vale la pena tumbar toda la cola por una.
    }
  }
  return sessions;
}

/** La sesión pendiente de un workout puntual, o `null` si no hay nada capturado. */
export async function getPendingSession(workoutId: string): Promise<PendingSession | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    workout_id: string;
    payload: string;
    updated_at: number;
    attempts: number;
    last_error: string | null;
  }>(
    "SELECT workout_id, payload, updated_at, attempts, last_error FROM pending_sessions WHERE workout_id = ?",
    [workoutId],
  );
  if (!row) return null;
  try {
    return {
      workoutId: row.workout_id,
      payload: JSON.parse(row.payload) as SessionSyncInput,
      updatedAt: row.updated_at,
      attempts: row.attempts,
      lastError: row.last_error,
    };
  } catch {
    return null;
  }
}

export async function countPendingSessions(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>(
    "SELECT COUNT(*) AS total FROM pending_sessions",
  );
  return row?.total ?? 0;
}

/** El servidor confirmó la sesión: sale de la cola. */
export async function markSynced(workoutId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM pending_sessions WHERE workout_id = ?", [workoutId]);
}

/** Falló el envío: se queda en la cola con el intento y el error registrados. */
export async function bumpAttempt(workoutId: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE pending_sessions SET attempts = attempts + 1, last_error = ? WHERE workout_id = ?",
    [error, workoutId],
  );
}

/**
 * Borra todo lo del modo gimnasio del teléfono: semana en cache y cola
 * pendiente. Se llama al cerrar sesión — lo de una atleta no puede quedar
 * disponible para quien abra la app después con otra cuenta.
 */
export async function purgeTrainingData(): Promise<void> {
  const db = await getDb();
  await db.execAsync("DELETE FROM week_cache; DELETE FROM pending_sessions;");
}
