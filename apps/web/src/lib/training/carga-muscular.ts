import type { Discipline, MuscleGroup } from "@/lib/training/types";

/**
 * Qué carga cada disciplina, y cuánto.
 *
 * Existe para responder una pregunta concreta: si el martes nadaste, ¿el
 * miércoles de espalda debería pesar igual? La respuesta honesta es que no —
 * el crol es tracción de dorsal durante cuarenta minutos— pero tampoco es
 * "ya entrenaste espalda, sáltate el día".
 *
 * **Lo que este mapa NO dice.** Que una disciplina pueda sustituir el trabajo
 * de fuerza de otra. Nadar no reemplaza un jalón pesado: el estímulo de
 * hipertrofia necesita carga alta y pocas repeticiones, y cuarenta minutos de
 * crol son resistencia. Lo que sí dice es qué llega **fatigado** al día
 * siguiente, que es lo que permite quitar volumen donde sobra en vez de
 * quitarlo al azar.
 *
 * Los valores son ordinales, no porcentajes de activación: `2` es "esta
 * disciplina carga eso de verdad", `1` es "lo usa", y lo que no aparece no se
 * toca lo suficiente como para cambiar el día siguiente. Poner números finos
 * —"el crol activa el dorsal al 62 %"— sería inventar precisión que solo
 * existe en un laboratorio con electrodos.
 */

export type CargaMuscular = Partial<Record<MuscleGroup, 1 | 2>>;

export const CARGA_POR_DISCIPLINA: Record<Discipline, CargaMuscular> = {
  // El gimnasio se planea por día, no por disciplina: su carga sale del split.
  PESAS: {},

  /**
   * Crol y espalda son tracción sostenida de dorsal y hombro; la patada
   * involucra pierna pero sin carga que fatigue una sentadilla del día
   * siguiente.
   */
  NATACION: { ESPALDA: 2, HOMBRO: 2, PECHO: 1, ABDOMEN: 1 },

  /**
   * El golpeo sale de la cadera y el core, no del brazo; el hombro trabaja por
   * sostener la guardia durante asaltos enteros, que es fatiga real aunque no
   * se sienta como entrenamiento de hombro.
   */
  BOX: { HOMBRO: 2, ABDOMEN: 2, PIERNA: 1, ESPALDA: 1 },

  /**
   * Arrancadas, frenadas y cambios de dirección: pierna a impacto, más el core
   * que estabiliza cada giro.
   */
  SQUASH: { PIERNA: 2, ABDOMEN: 2, HOMBRO: 1 },

  /** Cuerpo completo por definición, con la pierna llevándose lo pesado. */
  CROSSFIT: { PIERNA: 2, ESPALDA: 2, HOMBRO: 2, ABDOMEN: 2, PECHO: 1 },

  /** Patrones de cuerpo completo con carga moderada y mucho core. */
  FUNCIONAL: { PIERNA: 2, ABDOMEN: 2, ESPALDA: 1, HOMBRO: 1 },

  /** Correr, bici, elíptica: pierna a volumen, sin carga de tren superior. */
  CARDIO: { PIERNA: 2 },

  /**
   * El swing es rotación explosiva de core y hombro, pero son un puñado de
   * segundos por golpe repartidos en cuatro horas de ronda — el volumen
   * articular real es bajo, por eso ninguno de los dos llega a `2`. La
   * caminata de una ronda de 18 hoyos suma varios kilómetros, pero a paso de
   * caminata: no deja la pierna con nada parecido a la fatiga de una sesión
   * de piernas, así que ni siquiera entra al mapa (ver el criterio de "no
   * aparece" arriba).
   */
  GOLF: { ABDOMEN: 1, HOMBRO: 1 },

  /** La cubeta de lo que se registra sin planearse: no se supone nada. */
  OTRO: {},
};

/**
 * Los grupos que llegan fatigados al gimnasio por otra disciplina.
 *
 * Solo cuenta la carga fuerte (`2`): si el trabajo fue incidental, quitar
 * volumen por eso sería recortar una sesión buena por una suposición.
 */
export function gruposFatigados(discipline: Discipline): MuscleGroup[] {
  const carga = CARGA_POR_DISCIPLINA[discipline] ?? {};
  return (Object.entries(carga) as Array<[MuscleGroup, 1 | 2]>)
    .filter(([, nivel]) => nivel === 2)
    .map(([grupo]) => grupo);
}

/**
 * Qué decirle a alguien que quiere mover trabajo del gimnasio a otra
 * disciplina.
 *
 * La pregunta que origina esto —"si nado, ¿puedo saltarme la pierna?"— tiene
 * una respuesta que depende de para qué entrena, y la app no debería contestar
 * "sí" ni "no" a secas.
 */
export function lecturaDeSustitucion(
  discipline: Discipline,
  grupo: MuscleGroup,
): { puede: boolean; texto: string } {
  const carga = CARGA_POR_DISCIPLINA[discipline]?.[grupo];

  if (carga === undefined) {
    return {
      puede: false,
      texto: `${nombreDeGrupo(grupo)} casi no trabaja en esa disciplina: moverlo ahí es dejar de entrenarlo.`,
    };
  }

  if (carga === 1) {
    return {
      puede: false,
      texto: `Esa disciplina usa ${nombreDeGrupo(grupo).toLowerCase()}, pero no lo carga: sirve para acompañar, no para reemplazar el día.`,
    };
  }

  return {
    puede: true,
    texto:
      `Sí carga ${nombreDeGrupo(grupo).toLowerCase()}, y por eso ese día de gimnasio va con menos ` +
      "volumen ahí. No es lo mismo: el estímulo de fuerza necesita carga alta y pocas " +
      "repeticiones, y esto es resistencia. Sirve para sostener, no para progresar en fuerza.",
  };
}

const NOMBRES: Record<MuscleGroup, string> = {
  PIERNA: "La pierna",
  HOMBRO: "El hombro",
  PECHO: "El pecho",
  ESPALDA: "La espalda",
  BICEP: "El bíceps",
  TRICEP: "El tríceps",
  ABDOMEN: "El core",
};

function nombreDeGrupo(grupo: MuscleGroup): string {
  return NOMBRES[grupo] ?? grupo;
}
