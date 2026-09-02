import type { DayKind, Warmup, WarmupStep } from "@/lib/training/types";

/**
 * Calentamiento dinámico previo a la sesión (Fase N — feedback directo del
 * dueño, 2026-09): "No nos gustó que el calentamiento fuera con el primer
 * ejercicio y con un montón de reps. El calentamiento debería ser previo al
 * primer ejercicio, para estirar puntualmente los músculos a trabajar en la
 * sesión, y un timer de 5-10 min."
 *
 * Antes, "calentar" era 1-2 series de 20-50 reps del PRIMER ejercicio
 * (`buildWarmupSets` en `progression.ts`) — exactamente lo que se quejó: se
 * veía y se sentía igual que cualquier serie efectiva, solo que con más
 * repeticiones. Este módulo es el reemplazo: un bloque aparte, ANTES de tocar
 * el primer ejercicio, con movimientos dinámicos específicos del grupo que
 * toca ese día.
 *
 * **Sustento documentado:**
 *
 * - El calentamiento general mejora el rendimiento y reduce el riesgo de
 *   lesión (Fradkin et al. 2010, meta-análisis).
 * - El estiramiento ESTÁTICO sostenido ≥60 s antes de fuerza REDUCE la
 *   producción de fuerza (Simic et al. 2013) — por eso este bloque es
 *   siempre DINÁMICO (movimiento activo, sin sostener el estiramiento), nunca
 *   estático. "Estirar puntualmente los músculos a trabajar" no significa
 *   sentarse a estirar 60 segundos cada uno.
 * - Protocolo de consenso (ACSM / NSCA): 2-3 min de elevación general del
 *   pulso + 4-6 movimientos dinámicos específicos del grupo del día, 30-45 s
 *   cada uno, ≈ 6-8 min en total + UNA serie de aproximación ligera en el
 *   primer compuesto (~50% del peso tope, 10-12 reps) — no series de 30. Esa
 *   última parte (la aproximación al peso de trabajo) se quedó donde ya
 *   estaba, en `buildWarmupSets`/`WARMUP_REPS_MIN`/`WARMUP_REPS_MAX` de
 *   `progression.ts`, ajustada al nuevo rango; lo que este módulo agrega es
 *   TODO lo anterior a esa serie.
 *
 * Es un módulo puro, igual que el resto de `training/`: mismo `DayKind`,
 * mismo resultado — nada de reloj ni de red aquí. El timer de cuenta
 * regresiva (los 5-10 min que pidió el dueño) vive en la pantalla
 * (`apps/mobile/src/app/en-vivo.tsx`), que es quien sabe de segundos y de
 * hápticos; aquí solo se declara CUÁNTO dura cada paso.
 */

/** Siempre el primer paso: sube el pulso antes de cualquier movimiento específico. */
const ELEVAR_PULSO: WarmupStep = {
  nombre: "Eleva el pulso: caminadora, cuerda o saltos suaves",
  segundos: 120,
};

const PIERNA: WarmupStep[] = [
  { nombre: "Sentadilla con peso corporal", segundos: 45 },
  { nombre: "Zancadas dinámicas", segundos: 45 },
  { nombre: "Balanceos de pierna al frente", segundos: 45 },
  { nombre: "Puente de glúteo", segundos: 45 },
  { nombre: "Círculos de tobillo y cadera", segundos: 45 },
  { nombre: "Rodillas al pecho caminando", segundos: 45 },
];

const PIERNA_FEMORAL: WarmupStep[] = [
  { nombre: "Peso muerto rumano con peso corporal", segundos: 45 },
  { nombre: "Balanceos de pierna al frente", segundos: 45 },
  { nombre: "Puente de glúteo", segundos: 45 },
  { nombre: "Patada de glúteo en cuadrupedia", segundos: 45 },
  { nombre: "Círculos de cadera", segundos: 45 },
  { nombre: "Zancadas dinámicas", segundos: 45 },
];

const PIERNA_GLUTEO: WarmupStep[] = [
  { nombre: "Puente de glúteo", segundos: 45 },
  { nombre: "Sentadilla sumo con peso corporal", segundos: 45 },
  { nombre: "Almeja con banda", segundos: 45 },
  { nombre: "Zancadas laterales", segundos: 45 },
  { nombre: "Círculos de cadera", segundos: 45 },
  { nombre: "Patada de glúteo en cuadrupedia", segundos: 45 },
];

const HOMBRO: WarmupStep[] = [
  { nombre: "Círculos de brazos", segundos: 45 },
  { nombre: "Dislocaciones de hombro con banda o palo", segundos: 45 },
  { nombre: "Lagartijas de escápula", segundos: 45 },
  { nombre: "Press con solo la barra", segundos: 45 },
  { nombre: "Rotaciones externas ligeras", segundos: 45 },
  { nombre: "Encogimientos de escápula", segundos: 45 },
];

const PECHO_ESPALDA: WarmupStep[] = [
  { nombre: "Círculos de brazos", segundos: 45 },
  { nombre: "Lagartijas de escápula", segundos: 45 },
  { nombre: "Gato-vaca", segundos: 45 },
  { nombre: "Remo con banda", segundos: 45 },
  { nombre: "Jalón con banda ligera", segundos: 45 },
  { nombre: "Dislocaciones de hombro con banda o palo", segundos: 45 },
];

const BRAZO: WarmupStep[] = [
  { nombre: "Círculos de muñeca", segundos: 45 },
  { nombre: "Curl de bíceps con banda ligera", segundos: 45 },
  { nombre: "Extensión de tríceps con banda ligera", segundos: 45 },
  { nombre: "Rotaciones de hombro", segundos: 45 },
  { nombre: "Apertura de pecho con banda", segundos: 45 },
  { nombre: "Colgarse de la barra 20-30 s", segundos: 45 },
];

const HOMBRO_BRAZO: WarmupStep[] = [
  { nombre: "Círculos de brazos", segundos: 45 },
  { nombre: "Dislocaciones de hombro con banda o palo", segundos: 45 },
  { nombre: "Rotaciones externas ligeras", segundos: 45 },
  { nombre: "Curl de bíceps con banda ligera", segundos: 45 },
  { nombre: "Extensión de tríceps con banda ligera", segundos: 45 },
  { nombre: "Encogimientos de escápula", segundos: 45 },
];

const TORSO: WarmupStep[] = [
  { nombre: "Círculos de brazos", segundos: 45 },
  { nombre: "Lagartijas de escápula", segundos: 45 },
  { nombre: "Gato-vaca", segundos: 45 },
  { nombre: "Remo con banda", segundos: 45 },
  { nombre: "Jalón con banda ligera", segundos: 45 },
  { nombre: "Press con solo la barra", segundos: 45 },
];

/**
 * Catálogo de movimientos dinámicos por tipo de día. Cada lista tiene los
 * grupos que ese `DayKind` toca (ver `DAY_GROUPS` en `split.ts`): 6
 * movimientos de 45 s dejan, sumados a los 2 min de pulso, una sesión de
 * 6.5 min — dentro del "6-8 min" del protocolo consenso.
 */
const MOVIMIENTOS_POR_DIA: Record<DayKind, WarmupStep[]> = {
  PIERNA_CUADRICEPS: PIERNA,
  PIERNA_FEMORAL: PIERNA_FEMORAL,
  PIERNA_GLUTEO: PIERNA_GLUTEO,
  HOMBRO: HOMBRO,
  PECHO_ESPALDA: PECHO_ESPALDA,
  BRAZO: BRAZO,
  HOMBRO_BRAZO: HOMBRO_BRAZO,
  TORSO: TORSO,
};

/**
 * El calentamiento de la sesión: 2 min de pulso + los movimientos dinámicos
 * del grupo que toca ese día. Se antepone SIEMPRE — nunca hay sesión sin el
 * paso de elevar el pulso primero.
 */
export function calentamientoPara(dayKind: DayKind): Warmup {
  const pasos = [ELEVAR_PULSO, ...(MOVIMIENTOS_POR_DIA[dayKind] ?? [])];
  const totalSeg = pasos.reduce((total, paso) => total + paso.segundos, 0);
  return { pasos, totalSeg };
}
