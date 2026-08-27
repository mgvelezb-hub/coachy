import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { apiUser, bearerToken, unauthorized } from "@/lib/api/auth";
import { GOAL_PREFIX, GOAL_VIEWS, goalPhotoPath, type GoalView } from "@/lib/coachy/goal";
import { supabaseAnonKey, supabaseUrl, PHOTO_BUCKET } from "@/lib/env";
import { deleteProgressPhotos } from "@/lib/storage";

/**
 * `/api/v1/goal/references` — confirmación y borrado de las referencias del
 * objetivo para la app nativa.
 *
 * No hay tabla que registrar (ver `@/lib/coachy/goal`): la app sube la foto
 * DIRECTO a Storage con su propia sesión a `goalPhotoPath(userId, view)`, la
 * RLS del bucket (primera carpeta = `auth.uid()`) ya lo permite. Este
 * endpoint solo confirma que el objeto quedó ahí (POST, mismo patrón que
 * `/api/v1/checkins/[id]/photos`) o lo borra (DELETE, mismo patrón que
 * `removeGoalReference` en `/app/objetivo/actions.ts`).
 *
 * La ruta SIEMPRE se arma en el servidor con el `userId` de la sesión y la
 * vista validada contra `GOAL_VIEWS` — nunca se acepta un path del cliente.
 */

export const dynamic = "force-dynamic";

function isGoalView(value: unknown): value is GoalView {
  return typeof value === "string" && (GOAL_VIEWS as readonly string[]).includes(value);
}

async function viewFromRequest(request: Request): Promise<unknown> {
  const { searchParams } = new URL(request.url);
  const fromQuery = searchParams.get("view");
  if (fromQuery !== null) return fromQuery;

  try {
    const body = (await request.json()) as unknown;
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>).view
      : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const rawView = typeof body === "object" && body !== null ? (body as Record<string, unknown>).view : null;
  if (!isGoalView(rawView)) {
    return NextResponse.json({ error: "vista inválida" }, { status: 422 });
  }
  const view = rawView;

  const path = goalPhotoPath(user.id, view);

  // El mismo JWT de quien subió la foto: la RLS del bucket (primera carpeta
  // = auth.uid()) decide qué puede listar este cliente, sin service role.
  const jwt = bearerToken(request);
  const supabase = createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const folder = `${user.id}/${GOAL_PREFIX}`;
  const filename = path.slice(folder.length + 1);

  const { data: entries, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .list(folder, { search: filename });

  if (error || !entries?.some((entry) => entry.name === filename)) {
    return NextResponse.json({ error: "la foto no está en storage" }, { status: 422 });
  }

  return NextResponse.json({ view, path }, { status: 201 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const rawView = await viewFromRequest(request);
  if (!isGoalView(rawView)) {
    return NextResponse.json({ error: "vista inválida" }, { status: 422 });
  }
  const view = rawView;

  await deleteProgressPhotos([goalPhotoPath(user.id, view)]);

  return NextResponse.json({ view, eliminada: true });
}
