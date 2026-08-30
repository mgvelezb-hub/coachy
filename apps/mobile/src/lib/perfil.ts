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

import {
  GOAL_ZONE_LABEL,
  type CheckInPoint,
  type GoalDirectionReading,
  type GoalEmphasis,
  type GoalGap,
  type GoalTrend,
  type GoalZoneReading,
  type HealthDayPayload,
  type WeekView,
} from "@/lib/api";
import type { Brecha } from "@/components/GapChart";
import { brechasDelMes, type MetaMedida } from "@/lib/metas";
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
  healthDays: HealthDayPayload[] | undefined;
  week: WeekView | null;
  /**
   * Los puntos de `GET /api/v1/history/measurements`, no los de
   * `/checkins`: el apego a la dieta viaja en ese contrato y no en el otro.
   */
  points: CheckInPoint[] | undefined;
  /**
   * Hoy en ISO. Con él, el eje de rutina se compara contra las sesiones que ya
   * tocaban en lugar de contra la semana entera; sin él, contra la semana.
   */
  hoy?: string;
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
  const dias = input.healthDays ?? [];

  const pasos = promedio(ventana(dias, "steps", DIAS_RECIENTES));
  const ejercicio = promedio(ventana(dias, "exerciseMin", DIAS_RECIENTES));
  const sueno = promedio(ventana(dias, "sleepMin", DIAS_RECIENTES));

  /**
   * Sesiones que YA TOCABAN, no las de toda la semana.
   *
   * Este era el engaño: el eje comparaba lo hecho contra el total del lunes al
   * domingo, así que el martes con dos de cinco el polígono se veía chico
   * aunque fueras al corriente — y en cuanto el reloj llenaba los otros ejes,
   * la telaraña completa se leía como "voy bien". Comparado contra lo que
   * tocaba hasta HOY, el número dice lo que pasó de verdad.
   */
  const sesiones = input.week?.sessions ?? [];
  const hoy = input.hoy ?? null;
  const yaTocaban = hoy === null ? sesiones : sesiones.filter((sesion) => sesion.date <= hoy);
  const hechas = yaTocaban.filter((sesion) => sesion.completedAt !== null).length;

  const ultimoPunto = recientesPrimero(input.points ?? [])[0] ?? null;
  const recuperacionValor = recuperacion(dias);

  return [
    {
      label: "Movimiento",
      value: fraccion(pasos, PASOS_META),
      esperado: 1,
      detalle: pasos === null ? null : `${Math.round(pasos).toLocaleString("es-MX")} pasos`,
      referencia: `meta ${PASOS_META.toLocaleString("es-MX")}`,
    },
    {
      label: "Ejercicio",
      value: fraccion(ejercicio, EJERCICIO_META_MIN),
      esperado: 1,
      detalle: ejercicio === null ? null : `${Math.round(ejercicio)} min al día`,
      referencia: `meta ${EJERCICIO_META_MIN} min`,
    },
    {
      label: "Descanso",
      value: fraccion(sueno, SUENO_META_MIN),
      esperado: 1,
      detalle: sueno === null ? null : `${(sueno / 60).toFixed(1)} h por noche`,
      referencia: `meta ${(SUENO_META_MIN / 60).toFixed(1)} h`,
    },
    {
      label: "Recuperación",
      value: recuperacionValor,
      esperado: 1,
      detalle:
        recuperacionValor === null
          ? null
          : `${Math.round(recuperacionValor * 100)} % de tu normal`,
      referencia: "tus últimas 4 semanas",
    },
    {
      label: "Rutina",
      value: yaTocaban.length === 0 ? null : fraccion(hechas, yaTocaban.length),
      esperado: 1,
      detalle:
        yaTocaban.length === 0 ? null : `${hechas} de ${yaTocaban.length} que ya tocaban`,
      referencia: `${sesiones.length} en la semana`,
    },
    {
      label: "Dieta",
      value: ultimoPunto ? fraccion(ultimoPunto.dietCompliance, 100) : null,
      esperado: 0.9,
      detalle: ultimoPunto ? `${ultimoPunto.dietCompliance} % de apego` : null,
      referencia: "esperado 90 %",
    },
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

// ---------------------------------------------------------------------------
// Zonas: la brecha contra la referencia
// ---------------------------------------------------------------------------

/**
 * Cuánto del camino a la referencia lleva cada zona.
 *
 * La lectura del objetivo es ORDINAL, no numérica: el modelo dice "cerca",
 * "media" o "lejos", nunca un porcentaje —estimar centímetros de una foto
 * sería inventar precisión que no existe—. Estos tres valores son la
 * traducción de esas tres palabras a una posición en el riel, y por eso son
 * redondos: 0.8, 0.5 y 0.2 se leen como "ya casi", "a medio camino" y "apenas
 * empezando", que es exactamente lo que el modelo quiso decir.
 */
const AVANCE_POR_BRECHA: Record<GoalGap, number> = {
  cerca: 0.8,
  media: 0.5,
  lejos: 0.2,
};

/**
 * Cómo se dice el movimiento entre un análisis y el anterior.
 *
 * Decía "igual" a secas, y la pregunta que eso deja es "¿igual a qué?". La
 * respuesta —igual que la última vez que se compararon tus fotos— es lo que
 * convierte una palabra suelta en un dato.
 */
const NOTA_POR_TENDENCIA: Record<GoalTrend, string> = {
  "acercándose": "más cerca que en tu análisis anterior",
  igual: "sin cambio desde tu análisis anterior",
  "alejándose": "más lejos que en tu análisis anterior",
};

/** Cómo se lee cada peldaño ordinal, en palabras de la persona. */
const TEXTO_POR_BRECHA: Record<GoalGap, string> = {
  cerca: "cerca de tu referencia",
  media: "a medio camino",
  lejos: "lejos todavía",
};

/** Las brechas del análisis, listas para `GapChart`. */
export function brechasDeObjetivo(readings: GoalZoneReading[] | undefined): Brecha[] {
  // `?? []` no es paranoia: la app se actualiza en el teléfono y la API en
  // Vercel, y entre un deploy y otro la app pide campos que el servidor
  // todavía no manda. Un `.map` sobre `undefined` tira la pantalla entera.
  return (readings ?? []).map((reading) => ({
    label: GOAL_ZONE_LABEL[reading.zona],
    avance: AVANCE_POR_BRECHA[reading.brecha],
    // Sin cifras a propósito: esta lectura sale de comparar fotos, y estimar
    // centímetros de una foto sería inventar precisión. Lo que sí se puede
    // decir es en qué peldaño estás y cómo te moviste desde la vez pasada.
    actual: TEXTO_POR_BRECHA[reading.brecha],
    nota: NOTA_POR_TENDENCIA[reading.tendencia],
  }));
}

/**
 * Las medidas de cinta contra el escalón del periodo, con número.
 *
 * Es el complemento honesto de `brechasDeObjetivo`: donde hay cinta hay
 * centímetros, y ahí sí se puede decir "94.6 → 93 cm, faltan 1.6 por bajar".
 * Donde solo hay foto, se queda la lectura ordinal. Mezclarlas sin decir cuál
 * es cuál sería prestarle a la foto una precisión que no tiene.
 */
export function medidasContraObjetivo(metas: MetaMedida[]): Brecha[] {
  return brechasDelMes(metas);
}

/**
 * Mientras no haya fotos propias, el mismo riel enseña otra cosa: cuánto
 * énfasis pide cada zona. No es una brecha —no se sabe qué tan lejos estás—
 * y por eso la nota lo dice con todas sus letras.
 */
const AVANCE_POR_ENFASIS: Record<GoalEmphasis, number> = { alto: 1, medio: 0.6, bajo: 0.3 };

export function enfasisDeObjetivo(readings: GoalDirectionReading[] | undefined): Brecha[] {
  return (readings ?? []).map((reading) => ({
    label: GOAL_ZONE_LABEL[reading.zona],
    avance: AVANCE_POR_ENFASIS[reading.enfasis],
    actual: `énfasis ${reading.enfasis}`,
    // Sin fotos tuyas no hay brecha que medir: esto es lo que tu referencia
    // pide trabajar, no qué tan lejos estás de ella.
    nota: "sale de tu referencia, no de tus fotos",
  }));
}
