import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { markNotificationsRead } from "@/lib/coachy/notifications";
import { markNotificationsReadSchema } from "@/lib/validation/notifications";

/**
 * `POST /api/v1/notifications/read` — la app nativa marca avisos como leídos.
 *
 * Ver el comentario de `markNotificationsRead` en `@/lib/coachy/notifications`:
 * esto es lo primero que escribe `readAt` para una atleta, y ese estado de
 * lectura pasa a ser compartido con el home web.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const parsed = markNotificationsReadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "datos fuera de rango", detalles: parsed.error.issues.slice(0, 5) },
      { status: 422 },
    );
  }

  const marcadas = await markNotificationsRead(user.id, parsed.data.ids);
  return NextResponse.json({ marcadas });
}
