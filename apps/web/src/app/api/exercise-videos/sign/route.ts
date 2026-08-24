import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth";
import { signedExerciseVideoUrls } from "@/lib/storage";

/**
 * URLs firmadas frescas para un lote de videos.
 *
 * La biblioteca guarda los videos en el teléfono bajo su ruta de storage, no
 * bajo la URL firmada — esa caduca en una hora. Cuando toca descargar (o
 * cuando el reproductor encuentra que la del HTML ya venció) se piden aquí.
 *
 * El bucket es privado: se firma con la sesión del propio usuario, así que sin
 * sesión no hay nada que devolver.
 */

const bodySchema = z.object({
  paths: z.array(z.string().min(1).max(300)).min(1).max(120),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "rutas inválidas" }, { status: 422 });
  }

  const urls = await signedExerciseVideoUrls(parsed.data.paths).catch(() => ({}));
  return NextResponse.json({ urls });
}
