/**
 * Los textos de las preferencias de entrenamiento — lógica PURA.
 *
 * Describen lo que el generador ya hace con cada preferencia. Si una
 * preferencia no cambia la planeación, no tiene por qué estar aquí: el ajuste
 * que solo se guarda es el que enseña a no confiar en los ajustes.
 */

import { DISCIPLINE_LABELS, type Discipline, type MuscleGroup, type SwimLevel } from "@/lib/api";

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

/**
 * Los niveles de natación con lo que cambia cada uno.
 *
 * Se declaran, no se infieren: el historial del reloj dice cuánto nadaste, no
 * si sabes nadar. Prescribir series fuertes a quien todavía no cruza la
 * alberca es la peor manera de estrenar una disciplina.
 */
export const NIVELES_NATACION: Array<{ valor: SwimLevel; nombre: string; detalle: string }> = [
  {
    valor: "PRINCIPIANTE",
    nombre: "Principiante",
    detalle: "Todavía no nadas de corrido. Técnica, tabla y descansos largos.",
  },
  {
    valor: "INTERMEDIO",
    nombre: "Intermedio",
    detalle: "Nadas 400-800 m sin parar. Series de resistencia y de velocidad.",
  },
  {
    valor: "AVANZADO",
    nombre: "Avanzado",
    detalle: "Más de 1500 m por sesión. Más volumen y menos descanso.",
  },
];

/**
 * Los niveles de cada disciplina, con qué significa cada uno.
 *
 * Es el espejo de lo que declara cada prescriptor en el servidor
 * (`apps/web/src/lib/training/disciplinas/`). Vive aquí para que Ajustes
 * pueda explicarlos sin pedir una llamada más, y se declara —no se infiere—:
 * el reloj sabe cuánto duró tu sesión, no si sabes caer de una caja.
 */
export const NIVELES_POR_DISCIPLINA: Partial<
  Record<Discipline, Array<{ valor: SwimLevel; nombre: string; detalle: string }>>
> = {
  PESAS: [
    {
      valor: "PRINCIPIANTE",
      nombre: "Principiante",
      detalle: "Menos de seis meses entrenando. Máquinas, mancuernas y patrones básicos.",
    },
    {
      valor: "INTERMEDIO",
      nombre: "Intermedio",
      detalle: "Dominas sentadilla, peso muerto y press. Entran las variantes con barra libre.",
    },
    {
      valor: "AVANZADO",
      nombre: "Avanzado",
      detalle: "Años entrenando y técnica sólida. Entran frontal, dominadas, fondos y trasnuca.",
    },
  ],
  NATACION: [
    { valor: "PRINCIPIANTE", nombre: "Principiante", detalle: "Todavía no nadas de corrido. Técnica, tabla y descansos largos." },
    { valor: "INTERMEDIO", nombre: "Intermedio", detalle: "Nadas 400-800 m sin parar. Series de resistencia y de velocidad." },
    { valor: "AVANZADO", nombre: "Avanzado", detalle: "Más de 1500 m por sesión. Más volumen y menos descanso." },
  ],
  SQUASH: [
    { valor: "PRINCIPIANTE", nombre: "Principiante", detalle: "Peloteas pero el punto se te va pronto. Desplazamiento y drive." },
    { valor: "INTERMEDIO", nombre: "Intermedio", detalle: "Juegas partidos completos. Patrones de dos y precisión." },
    { valor: "AVANZADO", nombre: "Avanzado", detalle: "Compites o juegas liga. Fantasmas y condicionados con presión." },
  ],
  BOX: [
    { valor: "PRINCIPIANTE", nombre: "Principiante", detalle: "Empiezas. Guardia, desplazamiento, jab y directo al saco." },
    { valor: "INTERMEDIO", nombre: "Intermedio", detalle: "Tienes combinaciones y aguantas asaltos. Sombra y saco técnico." },
    { valor: "AVANZADO", nombre: "Avanzado", detalle: "Entrenas seguido. Más asaltos y trabajo por intervalos." },
  ],
  FUNCIONAL: [
    { valor: "PRINCIPIANTE", nombre: "Principiante", detalle: "Empiezas con el equipo. Wall ball, trineo ligero y acarreos cortos." },
    { valor: "INTERMEDIO", nombre: "Intermedio", detalle: "Dominas las estaciones. Trineo, saco y SkiErg por tiempo." },
    { valor: "AVANZADO", nombre: "Avanzado", detalle: "Formato de carrera funcional: más rondas, menos descanso y carga alta." },
  ],
  CARDIO: [
    { valor: "PRINCIPIANTE", nombre: "Principiante", detalle: "Todavía no corres 10 min seguidos. Alternas correr y caminar." },
    { valor: "INTERMEDIO", nombre: "Intermedio", detalle: "Corres 30-40 min seguidos. Rodajes y series." },
    { valor: "AVANZADO", nombre: "Avanzado", detalle: "Corres varias veces por semana. Más volumen e intervalos." },
  ],
  CROSSFIT: [
    { valor: "PRINCIPIANTE", nombre: "Principiante", detalle: "Primeros meses. Peso corporal, progresiones y nada de olímpicos." },
    { valor: "INTERMEDIO", nombre: "Intermedio", detalle: "Escalas los WOD. Barra ligera y metcons completos." },
    { valor: "AVANZADO", nombre: "Avanzado", detalle: "WOD prescrito. Más rondas y más carga." },
  ],
};
