/**
 * Freno básico para `/api/health/ingest`.
 *
 * El atajo corre una vez al día. Cualquier cosa por encima de unas cuantas
 * llamadas por hora es un dedo pegado al botón o alguien probando tokens, y en
 * los dos casos la respuesta correcta es la misma: 429 y a otra cosa.
 *
 * Es una ventana fija en memoria del proceso. En Vercel cada instancia lleva su
 * propia cuenta, así que **no es una defensa contra un atacante distribuido** —
 * la defensa real es que el token es un UUID v4 (122 bits) y que el endpoint
 * nunca dice si un token existe o no. Esto es para no tirarse solos la base.
 */

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterMs: number };

const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 30;

const hits = new Map<string, { count: number; windowStart: number }>();

/** Evita que el mapa crezca sin fin en un proceso de larga vida. */
function evictExpired(now: number): void {
  if (hits.size < 5_000) return;
  for (const [key, entry] of hits) {
    if (now - entry.windowStart >= WINDOW_MS) hits.delete(key);
  }
}

export function rateLimit(
  key: string,
  now = Date.now(),
  options: { windowMs?: number; max?: number } = {},
): RateLimitResult {
  const windowMs = options.windowMs ?? WINDOW_MS;
  const max = options.max ?? MAX_HITS;

  evictExpired(now);

  const entry = hits.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    hits.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: max - 1 };
  }

  if (entry.count >= max) {
    return { ok: false, retryAfterMs: entry.windowStart + windowMs - now };
  }

  entry.count += 1;
  return { ok: true, remaining: max - entry.count };
}

/** Solo para pruebas. */
export function resetRateLimit(): void {
  hits.clear();
}
