import type { CoachyQuestion, WeekSignals } from "@/lib/coachy/types";
import type { EngineDecision } from "@/lib/engine-types";

/**
 * Banco de preguntas de Coachy (spec 03 §2.2.4).
 *
 * Reglas duras del banco:
 *  - máximo 3 preguntas por semana, como el coach real;
 *  - nunca la misma pregunta dos semanas seguidas;
 *  - nunca preguntas sobre estudios, síntomas médicos o diagnóstico: si hay un
 *    síntoma, la pregunta es operativa (qué sentiste, cuándo) y el texto remite
 *    a fisio o médico, no interpreta nada.
 *
 * Cada entrada declara cuándo aplica. El orden del arreglo es la prioridad:
 * seguridad primero, adherencia después, progreso al final.
 */

export const MAX_QUESTIONS = 3;

/** Contexto mínimo para elegir preguntas. */
export interface QuestionContext {
  signals: WeekSignals;
  category: EngineDecision["category"];
  /** Semana marcada como no concluyente por el motor (ciclo, sin datos). */
  inconclusiveWeek: boolean;
  /** La cintura bajó pero el peso no se movió. */
  recomposition: boolean;
  /** Las fotos mejoran pero el atleta dice sentirse igual o peor. */
  photosDisagreeWithFeeling: boolean;
}

interface BankEntry extends Omit<CoachyQuestion, "text"> {
  text: string;
  applies: (ctx: QuestionContext) => boolean;
}

const BANK: BankEntry[] = [
  // --- Seguridad y síntomas ------------------------------------------------
  {
    id: "sintoma-calambres",
    signal: "sintomas",
    text: "¿En qué momento del día te dan los calambres? ¿Estás salando bien las comidas y tomando agua mineral con limón?",
    applies: (ctx) => ctx.signals.sintomas.includes("calambres"),
  },
  {
    id: "sintoma-mareo",
    signal: "sintomas",
    text: "¿Los mareos te dan al entrenar o en reposo? Si se repiten esta semana, párale al entreno y checa con tu médico.",
    applies: (ctx) => ctx.signals.sintomas.includes("mareo"),
  },
  {
    id: "sintoma-dolor",
    signal: "sintomas",
    text: "¿El dolor te duele al despertar o todo el día? ¿Sigues con fisio?",
    applies: (ctx) =>
      ctx.signals.sintomas.some((s) => s.startsWith("dolor_")) &&
      !ctx.signals.sintomas.includes("mareo"),
  },
  {
    id: "sueno-bajo",
    signal: "sueno",
    text: "¿Cómo anda el sueño? ¿A qué hora te estás durmiendo entre semana?",
    applies: (ctx) => ctx.signals.sueno <= 2,
  },
  // --- Adherencia ----------------------------------------------------------
  {
    id: "adherencia-real",
    signal: "adherencia",
    text: "¿Qué porcentaje del plan cumpliste de verdad, y qué comida fue la que más se te complicó?",
    applies: (ctx) => ctx.signals.cumplimientoDieta < 80,
  },
  {
    id: "adherencia-entreno",
    signal: "adherencia",
    text: "¿Qué te impidió entrenar esta semana? ¿Fue el tiempo o cómo te sentías?",
    applies: (ctx) => ctx.signals.cumplimientoEntreno < 70,
  },
  {
    id: "hambre-alta",
    signal: "hambre",
    text: "¿En qué momento del día te da más hambre? ¿Antes o después de entrenar?",
    applies: (ctx) => ctx.signals.hambre >= 4,
  },
  {
    id: "saciedad-baja",
    signal: "saciedad",
    text: "¿Con cuál de las comidas te quedas corta? Le podemos subir volumen de vegetales sin mover los números.",
    applies: (ctx) => ctx.signals.saciedad <= 2,
  },
  // --- Señales cruzadas ----------------------------------------------------
  {
    id: "recomposicion-ropa",
    signal: "recomposicion",
    text: "El peso no se movió pero la cintura sí: eso es recomposición. ¿Cómo te está quedando la ropa, sobre todo los jeans?",
    applies: (ctx) => ctx.recomposition,
  },
  {
    id: "fotos-vs-sensacion",
    signal: "inconsistencia",
    text: "En las fotos veo cambio y tú me dices que te sientes igual. ¿Qué es lo que tú ves cuando las comparas con las del día 1?",
    applies: (ctx) => ctx.photosDisagreeWithFeeling,
  },
  {
    id: "inflamacion-alta",
    signal: "inflamacion",
    text: "¿En qué momento te sientes más inflamada, y con qué comida lo notas más?",
    applies: (ctx) => ctx.signals.inflamacion >= 4,
  },
  {
    id: "ciclo",
    signal: "ciclo",
    text: "¿En qué parte del ciclo estás? Es normal que esta semana la cinta no se mueva.",
    applies: (ctx) => ctx.inconclusiveWeek,
  },
  // --- Estancamiento -------------------------------------------------------
  {
    id: "estancamiento-agua",
    signal: "estancamiento",
    text: "¿Cuántos litros de agua estás tomando al día?",
    applies: (ctx) => ctx.signals.semanasSinProgreso >= 2,
  },
  {
    id: "estancamiento-porciones",
    signal: "estancamiento",
    text: "¿Estás pesando las porciones o calculando a ojo?",
    applies: (ctx) => ctx.signals.semanasSinProgreso >= 2,
  },
  // --- Progreso y mantenimiento -------------------------------------------
  {
    id: "progreso-comida",
    signal: "progreso",
    text: "¿Cómo sentiste la comida esta semana? ¿Te llenaba o te quedabas corta?",
    applies: () => true,
  },
  {
    id: "progreso-fuerza",
    signal: "progreso",
    text: "¿Cómo sentiste tus cargas esta semana? ¿Subiste en algún ejercicio?",
    applies: (ctx) => ctx.signals.fuerzaTendencia !== "baja",
  },
  {
    id: "mejora-plan",
    signal: "progreso",
    text: "¿Qué sientes que podríamos mejorar del plan para la semana que entra?",
    applies: (ctx) => ctx.category === "HOLD" || ctx.category === "MENU_REFRESH",
  },
];

/**
 * Elige hasta 3 preguntas.
 *
 * `askedLastWeek` son los ids de la semana anterior: se descartan salvo que sin
 * ellos no quedara ninguna pregunta, en cuyo caso vale más preguntar repetido
 * que quedarse callado.
 */
export function pickQuestions(
  ctx: QuestionContext,
  askedLastWeek: readonly string[] = [],
): CoachyQuestion[] {
  const eligible = BANK.filter((entry) => entry.applies(ctx));
  const fresh = eligible.filter((entry) => !askedLastWeek.includes(entry.id));
  const chosen = (fresh.length > 0 ? fresh : eligible).slice(0, MAX_QUESTIONS);

  return chosen.map(({ id, signal, text }) => ({ id, signal, text }));
}

/** Textos por id, para reconstruir una pregunta guardada. */
export function questionById(id: string): CoachyQuestion | null {
  const entry = BANK.find((item) => item.id === id);
  if (!entry) return null;
  return { id: entry.id, signal: entry.signal, text: entry.text };
}

/** Todos los ids del banco. Solo para pruebas y depuración. */
export function questionBankIds(): string[] {
  return BANK.map((entry) => entry.id);
}
