import { BOX } from "@/lib/tecnica/box";
import { CROSSFIT } from "@/lib/tecnica/crossfit";
import { FUNCIONAL } from "@/lib/tecnica/funcional";
import { NATACION } from "@/lib/tecnica/natacion";
import { RUNNING } from "@/lib/tecnica/running";
import { SQUASH } from "@/lib/tecnica/squash";
import type { EjercicioDisciplina, NivelEjercicio } from "@/lib/tecnica/tipos";
import { ORDEN_NIVEL } from "@/lib/tecnica/tipos";
import type { Discipline } from "@/lib/api";

/**
 * La biblioteca de cada disciplina.
 *
 * El criterio para entrar: que una sesión la pueda pedir por nombre. Si el WOD
 * dice "thruster" y la biblioteca no tiene thruster, la biblioteca no sirve —
 * que era el problema de la primera versión, con cuatro fichas genéricas por
 * disciplina y ningún movimiento real.
 */
export const BIBLIOTECA_POR_DISCIPLINA: Partial<Record<Discipline, EjercicioDisciplina[]>> = {
  NATACION,
  SQUASH,
  BOX,
  CARDIO: RUNNING,
  FUNCIONAL,
  CROSSFIT,
};

/** Los ejercicios de una disciplina, agrupados por nivel y en orden. */
export function porNivel(
  ejercicios: EjercicioDisciplina[],
): Array<{ nivel: NivelEjercicio; ejercicios: EjercicioDisciplina[] }> {
  return ORDEN_NIVEL.map((nivel) => ({
    nivel,
    ejercicios: ejercicios.filter((ejercicio) => ejercicio.nivel === nivel),
  })).filter((grupo) => grupo.ejercicios.length > 0);
}

/** Los ejercicios de una disciplina, agrupados por categoría, en el orden en que aparecen. */
export function porCategoria(
  ejercicios: EjercicioDisciplina[],
): Array<{ categoria: string; ejercicios: EjercicioDisciplina[] }> {
  const orden: string[] = [];
  const mapa = new Map<string, EjercicioDisciplina[]>();

  for (const ejercicio of ejercicios) {
    if (!mapa.has(ejercicio.categoria)) {
      mapa.set(ejercicio.categoria, []);
      orden.push(ejercicio.categoria);
    }
    mapa.get(ejercicio.categoria)!.push(ejercicio);
  }

  return orden.map((categoria) => ({ categoria, ejercicios: mapa.get(categoria)! }));
}

export { NIVEL_LABEL, ORDEN_NIVEL, resumenDeBiblioteca } from "@/lib/tecnica/tipos";
export type { EjercicioDisciplina, NivelEjercicio } from "@/lib/tecnica/tipos";
