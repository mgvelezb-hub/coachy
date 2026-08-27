import { z } from "zod";

import { fromISODate } from "@/lib/format";

/**
 * El query param `date` (`YYYY-MM-DD`) de `GET /api/v1/training/week`: deja
 * materializar otra semana que no sea la de hoy.
 *
 * Puro y sin Prisma a propósito — se prueba solo.
 */

const isoDateSchema = z.iso.date();

export type DateParamResult = { ok: true; date: Date } | { ok: false };

/**
 * Sin `raw` (el query param no vino), la referencia es "ahora": la semana en
 * curso. Con `raw` que no es una fecha ISO válida, falla — el caller responde
 * 400 en vez de adivinar una semana.
 */
export function resolveWeekReference(raw: string | null): DateParamResult {
  if (raw === null) return { ok: true, date: new Date() };

  const parsed = isoDateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };

  return { ok: true, date: fromISODate(parsed.data) };
}
