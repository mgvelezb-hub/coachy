/**
 * Almacén local del modo gimnasio.
 *
 * En el gimnasio no hay red — es un sótano con paredes de concreto. Así que la
 * pantalla escribe **primero** aquí y sube después: la rutina de la semana se
 * guarda para poder abrirla mañana sin señal, y cada serie capturada entra a
 * una cola que se vacía cuando vuelve la conexión, con reintentos espaciados.
 *
 * IndexedDB sin librería: son cuatro operaciones y no vale una dependencia más.
 * Si el navegador no la tiene (modo privado viejo), cae a `localStorage`.
 */

const DB_NAME = "coachy-training";
const DB_VERSION = 1;
const WEEKS = "weeks";
const QUEUE = "queue";
const LS_PREFIX = "coachy:training";

/**
 * Etiqueta del Background Sync. El service worker escucha exactamente esta y
 * lee la misma base (`coachy-training`, store `queue`): si el navegador lo
 * soporta, la cola se vacía aunque la app esté cerrada.
 */
export const SYNC_TAG = "coachy-training-sync";

export type QueueItem<T = unknown> = {
  id: string;
  payload: T;
  attempts: number;
  /** Epoch ms: antes de esto no se vuelve a intentar. */
  nextAttemptAt: number;
};

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WEEKS)) db.createObjectStore(WEEKS, { keyPath: "key" });
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const tx = db.transaction(store, mode);
        const request = action(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

function readLocal<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(`${LS_PREFIX}:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(`${LS_PREFIX}:${key}`, JSON.stringify(value));
  } catch {
    // Sin espacio: la sesión sigue en memoria.
  }
}

// --- Rutina de la semana ----------------------------------------------------

/** Guarda la semana para poder abrir la sesión de mañana sin red. */
export async function cacheWeek(key: string, week: unknown): Promise<void> {
  writeLocal(`week:${key}`, week);
  writeLocal("week:last", key);
  await run(WEEKS, "readwrite", (store) => store.put({ key, week, savedAt: Date.now() }));
}

export async function readCachedWeek(key: string): Promise<unknown | null> {
  const stored = await run<{ key: string; week: unknown }>(WEEKS, "readonly", (store) =>
    store.get(key),
  );
  if (stored?.week) return stored.week;
  return readLocal(`week:${key}`);
}

// --- Cola de sincronización -------------------------------------------------

const MAX_BACKOFF_MS = 5 * 60 * 1000;

function backoffFor(attempts: number): number {
  return Math.min(2 ** attempts * 1000, MAX_BACKOFF_MS);
}

export async function enqueue<T>(id: string, payload: T): Promise<void> {
  const item: QueueItem<T> = { id, payload, attempts: 0, nextAttemptAt: 0 };
  const written = await run(QUEUE, "readwrite", (store) => store.put(item));
  if (written === null) {
    const queue = readLocal<QueueItem<T>[]>("queue") ?? [];
    writeLocal("queue", [...queue.filter((entry) => entry.id !== id), item]);
    // Sin IndexedDB el service worker no puede leer la cola: queda el flush
    // de la app abierta, que es el comportamiento de siempre.
    return;
  }
  // Sin `await`: capturar la serie nunca espera al service worker.
  void requestBackgroundSync();
}

/**
 * Le pide al navegador que vacíe la cola cuando vuelva la red, aunque la app
 * ya esté cerrada.
 *
 * Es un extra, no un reemplazo: Safari no implementa Background Sync y ahí la
 * cola se sigue vaciando con el evento `online` y el intervalo de la pantalla.
 * Devuelve `false` cuando no se pudo registrar, para poder decirlo en pruebas.
 */
export async function requestBackgroundSync(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;

    // `ready` se queda colgado para siempre si nadie registró un worker (dev,
    // primera carga): `getRegistration` resuelve `undefined` y sigue la vida.
    const registration = (await navigator.serviceWorker.getRegistration()) as
      | (ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } })
      | undefined;

    if (!registration?.sync) return false;
    await registration.sync.register(SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}

export async function listQueue<T>(): Promise<QueueItem<T>[]> {
  const all = await run<QueueItem<T>[]>(QUEUE, "readonly", (store) => store.getAll());
  if (all !== null) return all;
  return readLocal<QueueItem<T>[]>("queue") ?? [];
}

async function dropFromQueue(id: string): Promise<void> {
  const done = await run(QUEUE, "readwrite", (store) => store.delete(id));
  if (done === null) {
    const queue = readLocal<QueueItem[]>("queue") ?? [];
    writeLocal(
      "queue",
      queue.filter((entry) => entry.id !== id),
    );
  }
}

async function reschedule(item: QueueItem): Promise<void> {
  const next: QueueItem = {
    ...item,
    attempts: item.attempts + 1,
    nextAttemptAt: Date.now() + backoffFor(item.attempts + 1),
  };
  const written = await run(QUEUE, "readwrite", (store) => store.put(next));
  if (written === null) {
    const queue = readLocal<QueueItem[]>("queue") ?? [];
    writeLocal(
      "queue",
      queue.map((entry) => (entry.id === item.id ? next : entry)),
    );
  }
}

export type FlushResult = { sent: number; pending: number; prs: string[] };

/**
 * Sube lo que quepa de la cola. Lo que falla se reprograma con espera doblada;
 * nada se pierde y nada se duplica (cada serie lleva su `clientId`).
 */
export async function flushQueue(): Promise<FlushResult> {
  const queue = await listQueue<{ sessions: unknown[] }>();
  const now = Date.now();
  let sent = 0;
  const prs: string[] = [];

  for (const item of queue) {
    if (item.nextAttemptAt > now) continue;

    try {
      const response = await fetch("/api/training/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        // El servidor la rechazó por forma, no por red: reintentar no ayuda.
        await dropFromQueue(item.id);
        continue;
      }
      if (!response.ok) {
        await reschedule(item as QueueItem);
        continue;
      }

      const body = (await response.json()) as {
        resultados?: Array<{ prs?: Array<{ exerciseName: string }> }>;
      };
      for (const result of body.resultados ?? []) {
        for (const pr of result.prs ?? []) prs.push(pr.exerciseName);
      }

      await dropFromQueue(item.id);
      sent += 1;
    } catch {
      await reschedule(item as QueueItem);
    }
  }

  const pending = (await listQueue()).length;
  return { sent, pending, prs };
}
