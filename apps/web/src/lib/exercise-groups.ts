/**
 * Las zonas del cuerpo con las que se navega la biblioteca.
 *
 * Vive aparte de `exercise-library.ts` porque esto es puro y lo comparten los
 * dos lados: el servidor que arma la biblioteca y la pantalla que la pinta.
 * Nada aquí toca la base ni el bucket.
 */

/** El orden en que se recorre el cuerpo en la app. */
export const MUSCLE_GROUP_ORDER = [
  "PIERNA",
  "HOMBRO",
  "PECHO",
  "ESPALDA",
  "BICEP",
  "TRICEP",
  "ABDOMEN",
] as const;

/** Cubeta para lo que el catálogo traiga con un grupo que no conocemos. */
export const OTHER_GROUP = "OTROS";

const GROUP_LABELS: Record<string, string> = {
  PIERNA: "Pierna y glúteo",
  HOMBRO: "Hombro",
  PECHO: "Pecho",
  ESPALDA: "Espalda",
  BICEP: "Bíceps",
  TRICEP: "Tríceps",
  ABDOMEN: "Core y abdomen",
  [OTHER_GROUP]: "Otros",
};

/** La llave normalizada del grupo: lo que no está en el orden cae en OTROS. */
export function muscleGroupKey(group: string | null | undefined): string {
  const upper = (group ?? "").trim().toUpperCase();
  return (MUSCLE_GROUP_ORDER as readonly string[]).includes(upper) ? upper : OTHER_GROUP;
}

/** El nombre que ve la atleta, en su vocabulario. */
export function muscleGroupLabel(group: string | null | undefined): string {
  return GROUP_LABELS[muscleGroupKey(group)] ?? "Otros";
}

export type LibraryExercise = {
  id: string;
  name: string;
  groupKey: string;
  groupLabel: string;
  substitutes: string[];
  /** Ruta canónica en Storage. `null` si el banco todavía no tiene el video. */
  videoPath: string | null;
  /** URL firmada al momento de pintar la página. Caduca. */
  videoUrl: string | null;
  bytes: number;
};

export type LibraryGroup = {
  key: string;
  label: string;
  exercises: LibraryExercise[];
  /** Cuántos de esos ejercicios tienen video. */
  videoCount: number;
  bytes: number;
};

/** Agrupa y ordena: el orden del cuerpo primero, OTROS al final. */
export function groupExercises(exercises: LibraryExercise[]): LibraryGroup[] {
  const buckets = new Map<string, LibraryExercise[]>();

  for (const exercise of exercises) {
    const list = buckets.get(exercise.groupKey);
    if (list) list.push(exercise);
    else buckets.set(exercise.groupKey, [exercise]);
  }

  const order: string[] = [...MUSCLE_GROUP_ORDER, OTHER_GROUP];

  return [...buckets.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([key, list]) => ({
      key,
      label: muscleGroupLabel(key),
      exercises: [...list].sort((a, b) => a.name.localeCompare(b.name, "es")),
      videoCount: list.filter((exercise) => exercise.videoPath !== null).length,
      bytes: list.reduce((sum, exercise) => sum + exercise.bytes, 0),
    }));
}
