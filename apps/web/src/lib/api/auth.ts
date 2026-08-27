import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { type SessionUser, upsertSessionUser } from "@/lib/auth";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Auth de la API pública `/api/v1` — la usa la futura app nativa (Expo).
 *
 * No hay cookies ahí: la app manda la sesión de Supabase como
 *
 *     Authorization: Bearer <access_token>
 *
 * Se valida contra Supabase con un cliente sin cookies (`auth.getUser(jwt)`,
 * el mismo patrón que `/api/health/ingest` usa para su token de atleta) y,
 * si el JWT es válido, se hace el mismo upsert de `public.users` que la
 * sesión por cookies.
 *
 * Regla dura: el JWT **jamás** se escribe. Ni en un log, ni en un mensaje de
 * error, ni en la respuesta — igual que el token de `/api/health/ingest`.
 */

/** Extrae el JWT de `Authorization: Bearer <jwt>`. Case-insensitive. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

/** Usuario autenticado por Bearer, o null si no hay sesión válida. */
export async function apiUser(request: Request): Promise<SessionUser | null> {
  const jwt = bearerToken(request);
  if (!jwt) return null;

  const supabase = createClient(supabaseUrl(), supabaseAnonKey());
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser(jwt);

  if (!authUser?.email) return null;

  return upsertSessionUser({ id: authUser.id, email: authUser.email });
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "no autorizado" }, { status: 401 });
}
