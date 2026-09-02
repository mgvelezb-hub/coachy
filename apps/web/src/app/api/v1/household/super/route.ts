import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import {
  HouseholdError,
  guardaSuperComprados,
  superCompradosDe,
} from "@/lib/household";

/**
 * `GET /api/v1/household/super` — el tachado de la lista de súper
 * compartida. `compartida: false` (con `items: []`) cuando la cuenta no
 * tiene un vínculo ACTIVO: sin hogar no hay nada que compartir, y la app
 * sigue guardando el tachado solo en el teléfono como hacía antes.
 *
 * `PUT /api/v1/household/super` — reemplaza el tachado compartido completo.
 * La app manda la lista entera en cada toque (optimista en el teléfono, PUT
 * en el fondo) en vez de un diff — es más simple y la lista nunca es tan
 * grande como para que importe el ancho de banda.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  items: z.array(z.string().max(120)).max(200),
});

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const items = await superCompradosDe(user.id);
  if (items === null) {
    return NextResponse.json({ compartida: false, items: [] });
  }
  return NextResponse.json({ compartida: true, items });
}

export async function PUT(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "items inválidos" }, { status: 422 });
  }

  try {
    await guardaSuperComprados(user.id, parsed.data.items);
  } catch (error) {
    if (error instanceof HouseholdError) {
      // 409: no es que el body esté mal, es que no hay CON QUIÉN compartirlo
      // todavía (sin vínculo ACTIVO) — el estado del recurso no lo permite.
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ compartida: true, items: parsed.data.items });
}
