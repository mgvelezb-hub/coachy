import type { Discipline } from "@/lib/api";

/**
 * La biblioteca de cada disciplina — datos PUROS.
 *
 * Qué tiene que cumplir una ficha para estar aquí: que la sesión la pueda
 * pedir por nombre. Si el WOD dice "thruster" y la biblioteca no tiene
 * thruster, la biblioteca no sirve — que era exactamente el problema de la
 * primera versión, con cuatro fichas genéricas por disciplina y ningún
 * movimiento real.
 *
 * Cada ficha lleva su nivel porque una biblioteca sin nivel invita a que un
 * principiante intente un muscle-up: el nivel no es una etiqueta de dificultad
 * decorativa, es la que ordena en qué orden se aprende.
 */

export type NivelEjercicio = "PRINCIPIANTE" | "INTERMEDIO" | "AVANZADO";

export type EjercicioDisciplina = {
  id: string;
  nombre: string;
  nivel: NivelEjercicio;
  /** Familia dentro de la disciplina: "Técnica", "Levantamiento", "Golpeo"... */
  categoria: string;
  /** Cómo se hace, en una o dos líneas. */
  como: string;
  /** Por qué vale la pena. */
  para: string;
  /** El error que casi todo el mundo comete. */
  ojo: string;
  /** Ruta del video, cuando exista: `library/{slug}.mp4` en el bucket privado. */
  videoPath?: string | null;
  /** `CC-BY-SA 4.0` (wger.de) o `Dominio público` (free-exercise-db). Solo si hay video. */
  videoLicense?: string | null;
  /** A quién acreditar cuando la licencia lo pide. Null en dominio público. */
  videoAuthor?: string | null;
};

export const NIVEL_LABEL: Record<NivelEjercicio, string> = {
  PRINCIPIANTE: "Para empezar",
  INTERMEDIO: "Intermedio",
  AVANZADO: "Avanzado",
};

export const ORDEN_NIVEL: NivelEjercicio[] = ["PRINCIPIANTE", "INTERMEDIO", "AVANZADO"];

/** El resumen de una biblioteca, con el mismo formato que el de gimnasio. */
export function resumenDeBiblioteca(
  ejercicios: EjercicioDisciplina[],
  descargados = 0,
): string {
  const conVideo = ejercicios.filter((ejercicio) => ejercicio.videoPath).length;
  const partes = [
    `${conVideo} ${conVideo === 1 ? "video" : "videos"}`,
    `${ejercicios.length} ${ejercicios.length === 1 ? "ejercicio" : "ejercicios"}`,
  ];
  if (descargados > 0) partes.push(`${descargados} descargados`);
  return partes.join(" · ");
}

export type BibliotecaDisciplina = {
  discipline: Discipline;
  ejercicios: EjercicioDisciplina[];
};
