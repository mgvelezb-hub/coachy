import type { Discipline } from "@/lib/training/types";
import { DISCIPLINES } from "@/lib/training/types";

/**
 * Cambiar el bloque de un día concreto: "hoy no pude ir a squash, dame gym".
 *
 * Es una EXCEPCIÓN DE FECHA, no un cambio de plan. La cancha ocupada, la
 * lluvia o el tráfico no cambian lo que quieres entrenar en general — cambian
 * lo de hoy. Antes la única salida era no entrenar (y que el día contara como
 * falla) o registrar una sesión libre a mano, que deja sin rutina que seguir.
 *
 * `PESAS` como destino es el caso más común y el que más trabajo requiere: hay
 * que materializar una sesión de gimnasio para ese día, con su split y sus
 * pesos, como cualquier otra.
 *
 * Módulo puro: lee y escribe el mapa, no toca la base.
 */

/** `{ "2026-09-01": "PESAS" }` — a qué se cambió el bloque de esa fecha. */
export type CambiosDeBloque = Record<string, Discipline>;

/** El `Json` del perfil, sin confiar en su forma. */
export function parseCambiosDeBloque(json: unknown): CambiosDeBloque {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return {};

  const salida: CambiosDeBloque = {};
  for (const [fecha, disciplina] of Object.entries(json as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    if (typeof disciplina !== "string") continue;
    if (!DISCIPLINES.includes(disciplina as Discipline)) continue;
    salida[fecha] = disciplina as Discipline;
  }
  return salida;
}

/**
 * Agrega un cambio y limpia los viejos.
 *
 * Se conservan 21 días: lo suficiente para que la semana en curso y la
 * anterior sigan leyéndose bien, y no tanto como para que el perfil acumule
 * excepciones de hace meses que ya no describen nada.
 */
export function conCambio(
  previos: CambiosDeBloque,
  fecha: string,
  disciplina: Discipline,
  hoy: string,
): CambiosDeBloque {
  const limite = new Date(`${hoy}T12:00:00Z`);
  limite.setDate(limite.getDate() - 21);
  const limiteISO = limite.toISOString().slice(0, 10);

  const salida: CambiosDeBloque = {};
  for (const [dia, valor] of Object.entries(previos)) {
    if (dia >= limiteISO) salida[dia] = valor;
  }
  salida[fecha] = disciplina;
  return salida;
}

/**
 * Aplica los cambios a las sesiones de otras disciplinas de la semana.
 *
 * Lo que se cambió a `PESAS` desaparece de esta lista: su sesión ya no es de
 * otra disciplina, es una de gimnasio y vive en `workouts`. Lo que se cambió a
 * otra disciplina conserva los minutos del bloque original — el tiempo
 * disponible ese día no cambió porque la cancha estuviera ocupada.
 */
export function aplicaCambios<T extends { date: string; discipline: string }>(
  sesiones: T[],
  cambios: CambiosDeBloque,
): T[] {
  if (Object.keys(cambios).length === 0) return sesiones;

  return sesiones
    .map((sesion) => {
      const cambio = cambios[sesion.date];
      if (cambio === undefined || cambio === sesion.discipline) return sesion;
      return { ...sesion, discipline: cambio };
    })
    .filter((sesion) => sesion.discipline !== "PESAS");
}
