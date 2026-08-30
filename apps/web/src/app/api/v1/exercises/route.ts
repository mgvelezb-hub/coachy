import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { prisma } from "@/lib/prisma";
import { signedExerciseVideoUrls } from "@/lib/storage";

/**
 * `GET /api/v1/exercises` — el catálogo completo del gimnasio.
 *
 * Existía solo la biblioteca de la semana: los ejercicios que te tocaron, con
 * su video. Servía para el gimnasio y no para aprender — quien quiere ver cómo
 * se hace un peso muerto rumano el día que no le toca, no lo encontraba.
 *
 * Trae la ficha completa (cómo, para qué, error común) y el nivel, para que la
 * biblioteca se pueda leer igual que la de las demás disciplinas.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const filas = await prisma.exercise.findMany({ orderBy: { name: "asc" } });

  // Los videos se firman en bloque; si Storage falla, el catálogo se sirve sin
  // ellos en vez de no servirse.
  const videos = await signedExerciseVideoUrls(filas.map((fila) => fila.videoUrl)).catch(() => ({}));

  return NextResponse.json({
    ejercicios: filas.map((fila) => ({
      id: fila.id,
      name: fila.name,
      muscleGroup: fila.muscleGroup,
      poolRole: fila.poolRole,
      level: fila.level,
      equipment: fila.equipment,
      howTo: fila.howTo,
      whyFor: fila.whyFor,
      watchOut: fila.watchOut,
      isTracker: fila.isTracker,
      substitutes: fila.substitutes,
      videoPath: fila.videoUrl,
      videoUrl: fila.videoUrl
        ? ((videos as Record<string, string>)[fila.videoUrl] ?? null)
        : null,
    })),
  });
}
