import "server-only";

import {
  groupExercises,
  muscleGroupKey,
  muscleGroupLabel,
  type LibraryExercise,
  type LibraryGroup,
} from "@/lib/exercise-groups";
import { prisma } from "@/lib/prisma";
import { signedExerciseVideoUrls } from "@/lib/storage";
import {
  EXERCISE_VIDEO_BUCKET,
  EXERCISE_VIDEO_PREFIX,
  splitExerciseVideoPath,
} from "@/lib/storage-paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * El catálogo de ejercicios visto como biblioteca: agrupado por zona del
 * cuerpo, con el video firmado y su peso en bytes.
 *
 * El peso sale del propio bucket (`storage.list`), no de una estimación: el
 * botón "Descargar (12 videos · 54 MB)" solo sirve si el número es el real.
 */

export type ExerciseLibrary = {
  groups: LibraryGroup[];
  totalExercises: number;
  totalVideos: number;
  totalBytes: number;
  /** `false` si el bucket no reportó tamaños: la UI oculta los MB. */
  sizesKnown: boolean;
};

/**
 * Tamaño de cada objeto del bucket, en bytes, indexado por la llave de storage
 * (`library/{slug}.mp4`). Si el listado falla, la biblioteca sigue funcionando
 * sin mostrar MB.
 */
export async function videoSizes(): Promise<Record<string, number>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.storage
      .from(EXERCISE_VIDEO_BUCKET)
      .list(EXERCISE_VIDEO_PREFIX, { limit: 1000 });

    if (error || !data) return {};

    const sizes: Record<string, number> = {};
    for (const entry of data) {
      const size = (entry.metadata as { size?: unknown } | null)?.size;
      if (typeof size === "number" && size > 0) {
        sizes[`${EXERCISE_VIDEO_PREFIX}/${entry.name}`] = size;
      }
    }
    return sizes;
  } catch {
    return {};
  }
}

/** Bytes de una ruta de `exercises.video_url` dentro del mapa de tamaños. */
export function bytesFor(sizes: Record<string, number>, videoPath: string | null): number {
  if (!videoPath) return 0;
  return sizes[splitExerciseVideoPath(videoPath).key] ?? 0;
}

/** La biblioteca completa, lista para pintarse. */
export async function exerciseLibrary(): Promise<ExerciseLibrary> {
  const rows = await prisma.exercise.findMany({ orderBy: { name: "asc" } });

  const [urls, sizes] = await Promise.all([
    signedExerciseVideoUrls(rows.map((row) => row.videoUrl)).catch(
      () => ({}) as Record<string, string>,
    ),
    videoSizes(),
  ]);

  const exercises = rows.map((row): LibraryExercise => {
    const groupKey = muscleGroupKey(row.muscleGroup);
    return {
      id: row.id,
      name: row.name,
      groupKey,
      groupLabel: muscleGroupLabel(groupKey),
      substitutes: row.substitutes,
      videoPath: row.videoUrl,
      videoUrl: row.videoUrl ? (urls[row.videoUrl] ?? null) : null,
      bytes: bytesFor(sizes, row.videoUrl),
    };
  });

  return {
    groups: groupExercises(exercises),
    totalExercises: exercises.length,
    totalVideos: exercises.filter((exercise) => exercise.videoPath !== null).length,
    totalBytes: exercises.reduce((sum, exercise) => sum + exercise.bytes, 0),
    sizesKnown: Object.keys(sizes).length > 0,
  };
}
