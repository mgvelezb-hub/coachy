import { describe, expect, it } from "vitest";

import {
  groupExercises,
  muscleGroupKey,
  muscleGroupLabel,
  OTHER_GROUP,
  type LibraryExercise,
} from "@/lib/exercise-groups";

function exercise(partial: Partial<LibraryExercise> & { name: string }): LibraryExercise {
  const groupKey = muscleGroupKey(partial.groupKey ?? "PIERNA");
  return {
    id: partial.id ?? partial.name,
    name: partial.name,
    groupKey,
    groupLabel: muscleGroupLabel(groupKey),
    substitutes: partial.substitutes ?? [],
    videoPath: partial.videoPath ?? null,
    videoUrl: partial.videoUrl ?? null,
    bytes: partial.bytes ?? 0,
  };
}

describe("zonas del cuerpo", () => {
  it("usa el vocabulario de la atleta, no el del esquema", () => {
    expect(muscleGroupLabel("PIERNA")).toBe("Pierna y glúteo");
    expect(muscleGroupLabel("BICEP")).toBe("Bíceps");
    expect(muscleGroupLabel("ABDOMEN")).toBe("Core y abdomen");
  });

  it("lo que no conoce cae en Otros, sin romperse", () => {
    expect(muscleGroupKey("ANTEBRAZO")).toBe(OTHER_GROUP);
    expect(muscleGroupKey(null)).toBe(OTHER_GROUP);
    expect(muscleGroupLabel("")).toBe("Otros");
  });

  it("tolera minúsculas y espacios del catálogo", () => {
    expect(muscleGroupKey(" pierna ")).toBe("PIERNA");
  });
});

describe("agrupar la biblioteca", () => {
  const exercises = [
    exercise({ name: "Curl martillo", groupKey: "BICEP" }),
    exercise({ name: "Zancada", groupKey: "PIERNA", videoPath: "a.mp4", bytes: 100 }),
    exercise({ name: "Antebrazo en polea", groupKey: "ANTEBRAZO" }),
    exercise({ name: "Prensa", groupKey: "PIERNA", videoPath: "b.mp4", bytes: 50 }),
  ];

  it("recorre el cuerpo en orden y deja Otros al final", () => {
    expect(groupExercises(exercises).map((group) => group.key)).toEqual([
      "PIERNA",
      "BICEP",
      OTHER_GROUP,
    ]);
  });

  it("ordena los ejercicios por nombre dentro del grupo", () => {
    const [pierna] = groupExercises(exercises);
    expect(pierna?.exercises.map((row) => row.name)).toEqual(["Prensa", "Zancada"]);
  });

  it("cuenta videos y bytes por grupo, para el botón de descarga", () => {
    const [pierna, bicep] = groupExercises(exercises);
    expect(pierna?.videoCount).toBe(2);
    expect(pierna?.bytes).toBe(150);
    expect(bicep?.videoCount).toBe(0);
  });
});
