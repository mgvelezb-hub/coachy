import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { isoFromDateColumn } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { signedPhotoUrls } from "@/lib/storage";

/**
 * `GET /api/v1/photos` — las fotos de progreso del atleta, con URL firmada.
 *
 * Existe para la bóveda de la app nativa: el único lugar donde se pueden ver,
 * y detrás de una clave que se pide en el teléfono. El servidor no guarda esa
 * clave ni sabe de ella —es una cerradura del dispositivo, no una segunda
 * autenticación— así que aquí el filtro sigue siendo el de siempre: el
 * `userId` sale del Bearer y nunca de la query.
 *
 * Las URLs son firmadas y caducan: el bucket es privado y nada de esto queda
 * accesible por link permanente.
 */

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

function parseLimit(searchParams: URLSearchParams): number {
  const raw = searchParams.get("limit");
  if (!raw) return DEFAULT_LIMIT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams);

  const photos = await prisma.photo.findMany({
    where: { checkIn: { userId: user.id } },
    orderBy: [{ checkIn: { date: "desc" } }, { view: "asc" }],
    take: limit,
    select: {
      id: true,
      view: true,
      storagePath: true,
      checkIn: { select: { id: true, date: true } },
    },
  });

  // `asAdmin` porque esta ruta se autentica con Bearer y no con cookies: el
  // cliente de servidor por cookie no existe aquí. El filtro de seguridad ya
  // ocurrió arriba —solo se firman rutas de fotos de este `userId`.
  const urls = await signedPhotoUrls(
    photos.map((photo) => photo.storagePath),
    { asAdmin: true },
  ).catch(() => ({}));

  return NextResponse.json({
    fotos: photos.map((photo) => ({
      id: photo.id,
      checkInId: photo.checkIn.id,
      date: isoFromDateColumn(photo.checkIn.date),
      view: photo.view,
      url: (urls as Record<string, string>)[photo.storagePath] ?? null,
    })),
  });
}
