/**
 * El perfil de la telaraña: seis frentes, cada uno como fracción de SU meta.
 *
 * Por qué normalizar: pasos, horas de sueño, sesiones y porcentaje de apego no
 * comparten unidad y no se pueden dibujar en la misma escala. Lo único
 * comparable entre ellos es "qué tanto de mi meta llevo", y eso es lo que
 * mide cada eje — de 0 a 1.
 *
 * Qué NO hace: inventar. Un eje sin dato regresa `null` y el dibujo lo marca;
 * rellenarlo con un promedio pintaría un perfil que nadie vivió.
 *
 * Módulo puro: sin red, sin React, sin reloj del sistema salvo el `today` que
 * se le pasa.
 */

import type { CheckInPoint, HealthDayPayload, WeekView } from "@/lib/api";
import { EJERCICIO_META_MIN, PASOS_META, SUENO_META_MIN } from "@/lib/insights";
import type { Eje } from "@/components/RadarChart";

/** Ventana corta: lo que describe "cómo vengo", no "cómo soy". */
const DIAS_RECIENTES = 7;
/** Ventana larga: la referencia personal contra la que se compara la corta. */
const DIAS_BASE = 28;

function recientesPrimero<T extends { date: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date));
}

function promedio(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ventana(
  days: HealthDayPayload[],
  field: "steps" | "exerciseMin" | "sleepMin" | "hrvMs",
  hasta: number,
  desde = 0,
): number[] {
  return recientesPrimero(days)
    .slice(desde, hasta)
    .map((day) => day[field])
    .filter((value): value is number => value !== null && value !== undefined);
}

/** Fracción 0-1 contra una meta, topada arriba: pasarse no estira el eje. */
function fraccion(valor: number | null, meta: number): number | null {
  if (valor === null || meta <= 0) return null;
  return Math.max(0, Math.min(1, valor / meta));
}

export type PerfilInput = {
  healthDays: HealthDayPayload[];
  week: WeekView | null;
  /**
   * Los puntos de `GET /api/v1/history/measurements`, no los de
   * `/checkins`: el apego a la dieta viaja en ese contrato y no en el otro.
   */
  points: CheckInPoint[];
};

/**
 * Los seis ejes.
 *
 * Tres salen del reloj (movimiento, ejercicio, descanso), uno de la
 * recuperación y dos del apego —entrenamiento y alimentación—, que son los que
 * dependen de decisiones y no de fisiología. Ese reparto es a propósito: un
 * perfil donde todo viene del reloj describe al reloj, no a la persona.
 */
export function perfilDeEjes(input: PerfilInput): Eje[] {
  const dias = input.healthDays;

  const pasos = promedio(ventana(dias, "steps", DIAS_RECIENTES));
  const ejercicio = promedio(ventana(dias, "exerciseMin", DIAS_RECIENTES));
  const sueno = promedio(ventana(dias, "sleepMin", DIAS_RECIENTES));

  const sesionesTotal = input.week?.sessions.length ?? 0;
  const sesionesHechas = input.week?.sessions.filter((s) => s.completedAt !== null).length ?? 0;

  const ultimoPunto = recientesPrimero(input.points)[0] ?? null;

  return [
    { label: "Movimiento", value: fraccion(pasos, PASOS_META) },
    { label: "Ejercicio", value: fraccion(ejercicio, EJERCICIO_META_MIN) },
    { label: "Descanso", value: fraccion(sueno, SUENO_META_MIN) },
    { label: "Recuperación", value: recuperacion(dias) },
    {
      label: "Rutina",
      value: sesionesTotal === 0 ? null : fraccion(sesionesHechas, sesionesTotal),
    },
    { label: "Dieta", value: ultimoPunto ? fraccion(ultimoPunto.dietCompliance, 100) : null },
  ];
}

/**
 * Recuperación: la variabilidad cardiaca de la semana contra TU normal de las
 * últimas cuatro.
 *
 * No se compara contra una tabla de población porque la HRV varía enormemente
 * entre personas —dos atletas sanos pueden tener 30 y 90 ms— y una tabla haría
 * ver "mal" a quien simplemente tiene la suya baja. Contra uno mismo, en
 * cambio, una caída sostenida sí significa algo: fatiga acumulada, mal sueño,
 * enfermedad en puerta o estrés.
 *
 * El eje se llena al 100 % cuando estás en tu normal o arriba; abajo cae
 * proporcional. Nunca es un diagnóstico.
 */
export function recuperacion(days: HealthDayPayload[]): number | null {
  const semana = promedio(ventana(days, "hrvMs", DIAS_RECIENTES));
  const base = promedio(ventana(days, "hrvMs", DIAS_BASE));
  if (semana === null || base === null || base <= 0) return null;
  return Math.max(0, Math.min(1, semana / base));
}
