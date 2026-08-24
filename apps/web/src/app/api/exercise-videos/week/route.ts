import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { bytesFor, videoSizes } from "@/lib/exercise-library";
import { prisma } from "@/lib/prisma";
import { signedExerciseVideoUrls } from "@/lib/storage";
import { parseStoredPlan } from "@/lib/training/db";
import { mondayOf, sundayEndOf } from "@/lib/training/generate";

/**
 * Los videos de la rutina de esta semana, para pre-descargarlos con red.
 *
 * Lee la semana **ya materializada**; no la crea. Materializar es trabajo de
 * `/app` y del modo gimnasio, y este endpoint corre en segundo plano en cada
 * visita: no tiene por qué escribir nada. Si la semana todavía no existe,
 * devuelve la lista vacía y la pre-descarga se salta sola.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "sin sesión" }, { status: 401 });

  const reference = new Date();
  reference.setHours(12, 0, 0, 0);

  const workouts = await prisma.workout.findMany({
    where: { userId: user.id, date: { gte: mondayOf(reference), lte: sundayEndOf(reference) } },
    orderBy: { date: "asc" },
  });

  const paths = [
    ...new Set(
      workouts
        .flatMap((workout) => parseStoredPlan(workout.exercisesJson).exercises)
        .map((exercise) => exercise.videoPath)
        .filter((path): path is string => Boolean(path)),
    ),
  ];

  if (paths.length === 0) return NextResponse.json({ videos: [] });

  const [urls, sizes] = await Promise.all([
    signedExerciseVideoUrls(paths).catch(() => ({}) as Record<string, string>),
    videoSizes(),
  ]);

  return NextResponse.json({
    videos: paths.map((path) => ({
      path,
      url: urls[path] ?? null,
      bytes: bytesFor(sizes, path),
    })),
  });
}
