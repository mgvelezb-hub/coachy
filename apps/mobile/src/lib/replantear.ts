import type { Discipline } from "@/lib/api";

/**
 * Las opciones del flujo para rearmar la rutina — texto y valores puros.
 *
 * Vive aparte de la pantalla porque son decisiones de producto, no de UI: qué
 * frases se ofrecen para el tiempo, qué propósitos existen y qué significa
 * cada uno. Cambiar una frase aquí cambia lo que el motor recibe, así que
 * conviene verlas juntas.
 */

export const DIAS_SEMANA = [
  { valor: "LUN" as const, nombre: "Lun" },
  { valor: "MAR" as const, nombre: "Mar" },
  { valor: "MIE" as const, nombre: "Mié" },
  { valor: "JUE" as const, nombre: "Jue" },
  { valor: "VIE" as const, nombre: "Vie" },
  { valor: "SAB" as const, nombre: "Sáb" },
  { valor: "DOM" as const, nombre: "Dom" },
];

export type WeekDay = (typeof DIAS_SEMANA)[number]["valor"];

/**
 * Cuánto tiempo hay, en frases.
 *
 * Los minutos que van por debajo son los que el motor usa para decidir qué
 * cabe; la frase es lo que la persona sí puede contestar sin adivinar.
 */
export const TIEMPOS_DIA: Array<{ minutos: number; nombre: string; corto: string }> = [
  { minutos: 0, nombre: "Ese día no", corto: "—" },
  { minutos: 30, nombre: "Poco tiempo", corto: "Poco" },
  { minutos: 60, nombre: "Una hora", corto: "1 h" },
  { minutos: 90, nombre: "Con calma", corto: "Calma" },
];

export const PROPOSITOS: Array<{ valor: Proposito; nombre: string; detalle: string }> = [
  {
    valor: "ENTRENAMIENTO",
    nombre: "Lo entreno",
    detalle: "Quiero mejorar en eso: pide sesiones completas.",
  },
  {
    valor: "COMPLEMENTO",
    nombre: "Complemento",
    detalle: "Sostiene lo demás: movilidad, cardio suave, recuperación.",
  },
  {
    valor: "HOBBY",
    nombre: "Por gusto",
    detalle: "Lo disfruto: pide un hueco, no un plan.",
  },
];

export type Proposito = "ENTRENAMIENTO" | "COMPLEMENTO" | "HOBBY";

/**
 * Rangos de edad, para quien no quiere dar su fecha exacta.
 *
 * El motor necesita una edad para el gasto basal; con el rango usa su punto
 * medio, que es aproximado pero declarado — mejor que suponer 30 años.
 */
export const RANGOS_EDAD = [
  { valor: "18_24", nombre: "18-24" },
  { valor: "25_34", nombre: "25-34" },
  { valor: "35_44", nombre: "35-44" },
  { valor: "45_54", nombre: "45-54" },
  { valor: "55_64", nombre: "55-64" },
  { valor: "65_MAS", nombre: "65+" },
];

/** Una disciplina elegida como secundaria, con para qué la quiere. */
export type SecundariaElegida = {
  discipline: Discipline;
  proposito: Proposito;
  importancia: number;
};
