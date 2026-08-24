import { NextResponse } from "next/server";

import {
  recentHealthDays,
  upsertHealthDays,
  userIdForToken,
} from "@/lib/health/db";
import { rateLimit } from "@/lib/health/rate-limit";
import { daysFromPayload, healthIngestSchema } from "@/lib/health/schema";

/**
 * Puerta de entrada de los datos del reloj (Fase 8).
 *
 * No hay app nativa ni HealthKit: quien habla aquí es un **Atajo de iOS** que
 * lee Salud y hace un POST diario (`apps/web/docs/atajo-salud.md`). El atajo no
 * tiene sesión ni cookies, así que se autentica con un token por atleta:
 *
 *     Authorization: Bearer <token>
 *
 * Reglas de la casa:
 *
 * - **El token jamás se escribe.** Ni en un log, ni en un mensaje de error, ni
 *   en la respuesta. Un log de Vercel no es un lugar para guardar credenciales.
 * - Token inválido y token inexistente contestan **lo mismo** (401 "token
 *   inválido"): así no se puede usar el endpoint para averiguar cuáles existen.
 * - `POST` es idempotente por `(atleta, día)`: reenviar el mismo día corrige.
 * - `GET` devuelve los últimos 7 días para que el atajo confirme que llegó.
 */

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "token inválido" };

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

/**
 * Llave del freno.
 *
 * Se usa un prefijo corto del token, no el token: alcanza para distinguir a un
 * atajo de otro y no deja la credencial viva en memoria más de lo necesario.
 */
function limitKey(token: string | null, request: Request): string {
  if (token) return `t:${token.slice(0, 8)}`;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${ip ?? "desconocida"}`;
}

function tooMany(retryAfterMs: number): NextResponse {
  return NextResponse.json(
    { error: "demasiadas peticiones" },
    { status: 429, headers: { "retry-after": String(Math.ceil(retryAfterMs / 1000)) } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const token = bearer(request);

  const limit = rateLimit(limitKey(token, request));
  if (!limit.ok) return tooMany(limit.retryAfterMs);

  if (!token) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const userId = await userIdForToken(token);
  if (!userId) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const parsed = healthIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "datos fuera de rango", detalles: parsed.error.issues.slice(0, 5) },
      { status: 422 },
    );
  }

  const days = daysFromPayload(parsed.data);
  const saved = await upsertHealthDays(userId, days);

  return NextResponse.json({
    ok: true,
    guardados: saved,
    fechas: days.map((day) => day.date),
  });
}

/** Los últimos 7 días, para que el atajo pueda confirmar que llegó. */
export async function GET(request: Request): Promise<NextResponse> {
  const token = bearer(request);

  const limit = rateLimit(limitKey(token, request));
  if (!limit.ok) return tooMany(limit.retryAfterMs);

  if (!token) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const userId = await userIdForToken(token);
  if (!userId) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const days = await recentHealthDays(userId, 7);
  return NextResponse.json({ dias: days });
}
