import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { apiUser, bearerToken, unauthorized } from "@/lib/api/auth";
import { supabaseAnonKey, supabaseUrl, PHOTO_BUCKET } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { photoPath } from "@/lib/storage";
import { PHOTO_VIEWS } from "@/lib/validation/checkin";

/**
 * `POST /api/v1/checkins/[id]/photos` — registra una foto de progreso que la
 * app nativa ya subió DIRECTO a Supabase Storage con su propia sesión (la
 * RLS del bucket, por primera carpeta = `auth.uid()`, se lo permite). Este
 * endpoint no recibe el archivo: solo confirma que quedó en la ruta correcta
 * y crea la fila de `Photo`.
 *
 * La ruta nunca la manda el cliente — se reconstruye siempre con
 * `photoPath(userId, checkInId, view)`, igual que la web, para que no exista
 * forma de registrar una foto en la carpeta de otro atleta.
 */

export const dynamic = "force-dynamic";

const NOT_FOUND = { error: "check-in no encontrado" };

function isPhotoView(value: string): value is (typeof PHOTO_VIEWS)[number] {
  return (PHOTO_VIEWS as readonly string[]).includes(value);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const { id: checkInId } = await params;

  const checkIn = await prisma.checkIn.findFirst({
    where: { id: checkInId, userId: user.id },
    select: { id: true },
  });
  if (!checkIn) return NextResponse.json(NOT_FOUND, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const rawView = typeof body === "object" && body !== null ? (body as Record<string, unknown>).view : null;
  if (typeof rawView !== "string" || !isPhotoView(rawView)) {
    return NextResponse.json({ error: "vista inválida" }, { status: 422 });
  }
  const view = rawView;

  const path = photoPath(user.id, checkIn.id, view);

  // El mismo JWT del atajo/app nativa, para que la RLS del bucket (primera
  // carpeta = auth.uid()) sea la que decide qué puede ver este cliente — no
  // se usa el service role aquí, no hace falta saltarse RLS para listar la
  // carpeta del propio usuario.
  const jwt = bearerToken(request);
  const supabase = createClient(supabaseUrl(), supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const folder = `${user.id}/${checkIn.id}`;
  const filename = path.slice(folder.length + 1);

  // `list` con `search` es lo más barato para confirmar que el objeto existe:
  // no baja el archivo, solo pide metadatos de esa carpeta.
  const { data: entries, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .list(folder, { search: filename });

  if (error || !entries?.some((entry) => entry.name === filename)) {
    return NextResponse.json({ error: "la foto no está en storage" }, { status: 422 });
  }

  // Una vista puede tener varias fotos (p. ej. dos perfiles); el check-in
  // semanal reemplaza las de su propia vista, igual que la web.
  await prisma.photo.deleteMany({ where: { checkInId: checkIn.id, view } });
  await prisma.photo.create({ data: { checkInId: checkIn.id, view, storagePath: path } });

  return NextResponse.json({ view, path }, { status: 201 });
}
