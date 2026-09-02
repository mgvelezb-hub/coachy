import { ORDEN_NIVEL } from "@/lib/tecnica";
import type { EjercicioGym, SessionExerciseView, WeekView } from "@/lib/api";

/**
 * Clasificación de la biblioteca de Gym — lógica PURA.
 *
 * Vive aparte de las pantallas porque tanto la lista de Biblioteca (que solo
 * necesita el resumen: cuántos videos, cuántas zonas) como la hoja de Gym
 * (que necesita el catálogo completo agrupado por zona y nivel) parten de la
 * misma clasificación. Duplicarla en dos pantallas es la manera segura de que
 * un día se les desincronice el orden de las zonas.
 */

export const MUSCLE_GROUP_ORDER = ["PIERNA", "HOMBRO", "PECHO", "ESPALDA", "BICEP", "TRICEP", "ABDOMEN"] as const;
export const OTHER_GROUP = "OTROS";
export const GROUP_LABELS: Record<string, string> = {
  PIERNA: "Pierna y glúteo",
  HOMBRO: "Hombro",
  PECHO: "Pecho",
  ESPALDA: "Espalda",
  BICEP: "Bíceps",
  TRICEP: "Tríceps",
  ABDOMEN: "Core y abdomen",
  [OTHER_GROUP]: "Otros",
};

export function groupKey(group: string): string {
  const upper = group.trim().toUpperCase();
  return (MUSCLE_GROUP_ORDER as readonly string[]).includes(upper) ? upper : OTHER_GROUP;
}

export type LibraryVideo = {
  key: string;
  name: string;
  groupKey: string;
  videoPath: string;
  videoUrl: string | null;
};

export type LibraryGroup = { key: string; label: string; videos: LibraryVideo[] };

/** Un ejercicio por `exerciseId` (o nombre, si no trae id) — la semana repite
 * el mismo ejercicio en varios días y aquí solo hace falta uno. Se usa cuando
 * todavía no hay catálogo completo (`GET /api/v1/exercises` falló o no trae
 * nada): la única fuente que queda es la semana. */
export function libraryFromWeek(week: WeekView): LibraryGroup[] {
  const byKey = new Map<string, LibraryVideo>();

  for (const session of week.sessions) {
    for (const exercise of session.exercises as SessionExerciseView[]) {
      if (!exercise.videoPath) continue;
      const key = exercise.exerciseId ?? `${exercise.name}:${exercise.videoPath}`;
      if (byKey.has(key)) continue;
      byKey.set(key, {
        key,
        name: exercise.name,
        groupKey: groupKey(exercise.muscleGroup),
        videoPath: exercise.videoPath,
        videoUrl: exercise.videoUrl,
      });
    }
  }

  const buckets = new Map<string, LibraryVideo[]>();
  for (const video of byKey.values()) {
    const list = buckets.get(video.groupKey);
    if (list) list.push(video);
    else buckets.set(video.groupKey, [video]);
  }

  const order = [...MUSCLE_GROUP_ORDER, OTHER_GROUP];
  return [...buckets.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([key, videos]) => ({
      key,
      label: GROUP_LABELS[key] ?? "Otros",
      videos: [...videos].sort((a, b) => a.name.localeCompare(b.name, "es")),
    }));
}

/** Las zonas del catálogo completo, en el orden en que se recorre el cuerpo. */
export function zonasDelCatalogo(
  catalogo: EjercicioGym[],
): Array<{ grupo: string; label: string; ejercicios: EjercicioGym[] }> {
  return MUSCLE_GROUP_ORDER.map((grupo) => ({
    grupo,
    label: GROUP_LABELS[grupo] ?? grupo,
    ejercicios: catalogo.filter((ejercicio) => ejercicio.muscleGroup === grupo),
  })).filter((zona) => zona.ejercicios.length > 0);
}

/** Los ejercicios de una zona, agrupados por nivel de aprendizaje. */
export function nivelesDeZona(
  ejercicios: EjercicioGym[],
): Array<{ nivel: EjercicioGym["level"]; ejercicios: EjercicioGym[] }> {
  return ORDEN_NIVEL.map((nivel) => ({
    nivel,
    ejercicios: ejercicios.filter((ejercicio) => ejercicio.level === nivel),
  })).filter((grupo) => grupo.ejercicios.length > 0);
}

/** Con qué se hace, en el vocabulario del gimnasio. */
export const EQUIPO_LABEL: Record<string, string> = {
  BARRA: "Barra",
  MANCUERNA: "Mancuerna",
  MAQUINA: "Máquina",
  POLEA: "Polea",
  PESO_CORPORAL: "Peso corporal",
};
