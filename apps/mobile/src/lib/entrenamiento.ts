/**
 * Los textos de las preferencias de entrenamiento — lógica PURA.
 *
 * Describen lo que el generador ya hace con cada preferencia. Si una
 * preferencia no cambia la planeación, no tiene por qué estar aquí: el ajuste
 * que solo se guarda es el que enseña a no confiar en los ajustes.
 */

import { DISCIPLINE_LABELS, type Discipline, type MuscleGroup } from "@/lib/api";

/** El nombre de cada grupo en el vocabulario de la app. */
export const GRUPOS: Array<{ valor: MuscleGroup; nombre: string }> = [
  { valor: "PIERNA", nombre: "Pierna y glúteo" },
  { valor: "HOMBRO", nombre: "Hombro" },
  { valor: "PECHO", nombre: "Pecho" },
  { valor: "ESPALDA", nombre: "Espalda" },
  { valor: "BICEP", nombre: "Bíceps" },
  { valor: "TRICEP", nombre: "Tríceps" },
  { valor: "ABDOMEN", nombre: "Core y abdomen" },
];

/**
 * Las disciplinas que la app registra.
 *
 * `planeada` distingue lo que el generador sabe prescribir de lo que hoy solo
 * cuenta sesiones. Es la diferencia que la pantalla tiene que decir en voz
 * alta: agregar natación cambia cuántos días de gimnasio te tocan, pero
 * todavía no te arma la sesión de alberca.
 */
export const DISCIPLINAS: Array<{ valor: Discipline; nombre: string; planeada: boolean }> = [
  // El orden es el de la secuencia acordada: natación primero, porque es la
  // que menos interfiere con la fuerza.
  "PESAS",
  "NATACION",
  "FUNCIONAL",
  "CROSSFIT",
  "BOX",
  "SQUASH",
  "CARDIO",
  "OTRO",
].map((valor) => ({
  valor: valor as Discipline,
  nombre: DISCIPLINE_LABELS[valor as Discipline],
  planeada: valor === "PESAS",
}));

/** Topes de tiempo de cocina que se ofrecen, más "sin tope". */
export const TIEMPOS_COCINA: Array<{ valor: number | null; nombre: string }> = [
  { valor: 10, nombre: "10 min" },
  { valor: 20, nombre: "20 min" },
  { valor: 30, nombre: "30 min" },
  { valor: null, nombre: "Sin tope" },
];

/**
 * Cuántas sesiones de la semana se van en las otras disciplinas.
 *
 * Es la misma cuenta que hace el servidor (`sessionsSpentOutsideGym`), aquí
 * para poder enseñar el resultado antes de guardar: si el número no se ve, la
 * regla de "no se suma encima" parece un castigo en vez de un presupuesto.
 */
export function sesionesFueraDelGimnasio(
  cargas: Array<{ sessionsPerWeek: number }>,
): number {
  return cargas.reduce((total, carga) => total + Math.max(0, carga.sessionsPerWeek), 0);
}

/** Días de gimnasio que quedan tras pagar las otras disciplinas. */
export function diasDeGimnasio(
  presupuesto: number,
  cargas: Array<{ sessionsPerWeek: number }>,
  primaria: Discipline,
): number {
  if (presupuesto <= 0) return 0;
  const piso = primaria === "PESAS" ? 1 : 0;
  return Math.max(piso, presupuesto - sesionesFueraDelGimnasio(cargas));
}

/** Lista escrita a mano ("pollo, avena") a arreglo normalizado. */
export function listaDeAlimentos(texto: string): string[] {
  return Array.from(
    new Set(
      texto
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 30);
}
