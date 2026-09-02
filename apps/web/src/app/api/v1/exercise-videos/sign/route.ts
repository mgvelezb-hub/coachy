import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { signedExerciseVideoUrls } from "@/lib/storage";

/**
 * URLs firmadas para rutas de Storage sueltas — versión Bearer de
 * `/api/exercise-videos/sign` (esa usa cookies; la app nativa no las tiene).
 *
 * La necesitan las disciplinas que no tienen tabla propia en la base
 * (funcional, crossfit, running, …): su `videoPath` (`library/{slug}.mp4`)
 * vive escrito a mano en `apps/mobile/src/lib/tecnica/*.ts`, así que no hay
 * fila de `exercises` de la que colgar la firma — solo la ruta de Storage.
 */

const bodySchema = z.object({
  paths: z.array(z.string().min(1).max(300)).min(1).max(120),
});

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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "rutas inválidas" }, { status: 422 });
  }

  const urls = await signedExerciseVideoUrls(parsed.data.paths).catch(() => ({}));
  return NextResponse.json({ urls });
}
