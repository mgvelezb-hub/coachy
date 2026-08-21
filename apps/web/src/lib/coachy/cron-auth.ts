import "server-only";

import { NextResponse } from "next/server";

/**
 * Autenticación de los endpoints que no tienen sesión: los crons de Vercel y la
 * cola de reintento de Coachy.
 *
 * Vercel manda `Authorization: Bearer $CRON_SECRET`. Si la variable no existe,
 * el endpoint responde 503: prefiero un cron muerto a un endpoint abierto.
 */

export type CronGuard = { ok: true } | { ok: false; response: NextResponse };

export function guardCronRequest(request: Request): CronGuard {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Falta CRON_SECRET. Este endpoint queda cerrado hasta que exista." },
        { status: 503 },
      ),
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ")
    ? header.slice(7)
    : (request.headers.get("x-cron-secret") ?? "");

  if (provided !== secret) {
    return { ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }

  return { ok: true };
}
