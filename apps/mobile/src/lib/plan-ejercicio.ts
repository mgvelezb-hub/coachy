/**
 * La meta diaria de minutos de ejercicio — del PLAN, no un número fijo.
 *
 * EL PROBLEMA que resuelve: el anillo de Ejercicio traía una meta genérica
 * de 30 min (`EJERCICIO_META_MIN`, la guía general de actividad física),
 * pero quien entrena de verdad no tiene 30 min de plan — tiene 90, 120, los
 * que sumen sus disciplinas ese día. Con la meta genérica, cualquiera que
 * ya entrena cierra el anillo con un calentamiento y el resto del día el
 * anillo miente: dice "cumplido" cuando en realidad falta toda la sesión.
 *
 * La fuente más honesta, de mayor a menor precisión:
 * 1. `timePerDay` (Fase 7, Ajustes): lo que la persona declaró que tiene
 *    disponible ESE día de la semana — ya suma todas sus disciplinas
 *    combinadas, es el campo que el propio backend describe como "lo que
 *    hace honesto el reparto de un día combinado" (ver el docblock de
 *    `MeResponse.profile.timePerDay` en `lib/api.ts`).
 * 2. Sin declarar, pero con sesión(es) programadas hoy: no hay forma de
 *    saber cuánto dura una sesión de pesas — el propio generador la deja
 *    en "series y reps", nunca en minutos exactos (ver el docblock de
 *    `RECORTES` en `lib/entrenamiento.ts`: "nadie sabe si le quedan 25 o 40
 *    minutos… fingir esa precisión sería la misma mentira"). Por eso NO se
 *    inventa un estimado de series×reps: se usa el default de 60 min que ya
 *    ofrece el onboarding, con la fuente marcada como "estimado" para quien
 *    quiera saber que es un default y no un hecho. Las otras disciplinas
 *    (`otherSessions`) sí traen minutos reales, y esos se suman tal cual.
 * 3. Sin ninguna sesión hoy: es un día de descanso — la meta baja a un
 *    número chico de movimiento, no la meta de entrenamiento del resto de
 *    la semana.
 */

import { EJERCICIO_META_MIN } from "@/lib/insights";
import type { WeekView } from "@/lib/api";

/** Claves de `timePerDay`, en el orden que regresa `Date#getUTCDay()` (0 = domingo). */
const CLAVES_POR_INDICE = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"] as const;
export type ClaveDia = (typeof CLAVES_POR_INDICE)[number];

/** yyyy-MM-dd → su clave de día ("LUN".."DOM"), en UTC para no cruzar de día por el huso local. */
export function claveDeDia(fechaISO: string): ClaveDia {
  const [year, month, day] = fechaISO.split("-").map(Number) as [number, number, number];
  const indice = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return CLAVES_POR_INDICE[indice]!;
}

/**
 * Minutos de gimnasio cuando nadie declaró cuánto dura su sesión.
 *
 * Mismo número que ya ofrece el onboarding (`SESSION_MINUTES_OPTIONS`) por
 * default — no es un cálculo, es la mejor suposición disponible sin pedirle
 * un dato nuevo a nadie.
 */
const MINUTOS_GYM_SIN_DECLARAR = 60;

export type FuenteMeta = "declarado" | "estimado" | "descanso";

export type MetaDia = {
  minutos: number;
  fuente: FuenteMeta;
};

/** La meta de HOY: la suma real de los bloques planeados del día. */
export function metaDeHoy(params: {
  timePerDay: Record<string, number> | null | undefined;
  hoyISO: string;
  week: WeekView | null;
}): MetaDia {
  const { timePerDay, hoyISO, week } = params;

  const declarado = timePerDay?.[claveDeDia(hoyISO)];
  if (typeof declarado === "number" && declarado > 0) {
    return { minutos: declarado, fuente: "declarado" };
  }

  const gymHoy = week?.sessions.find((sesion) => sesion.date === hoyISO) ?? null;
  const otrasHoy = (week?.otherSessions ?? []).filter((sesion) => sesion.date === hoyISO);

  if (!gymHoy && otrasHoy.length === 0) {
    return { minutos: EJERCICIO_META_MIN, fuente: "descanso" };
  }

  const minutosOtras = otrasHoy.reduce((total, sesion) => total + sesion.minutes, 0);
  return {
    minutos: (gymHoy ? MINUTOS_GYM_SIN_DECLARAR : 0) + minutosOtras,
    fuente: "estimado",
  };
}

/**
 * La meta aplicable a CUALQUIER fecha, para leer el historial.
 *
 * No existe una foto de qué tenía declarado cada semana pasada — solo el
 * molde semanal ACTUAL (`timePerDay`). Se aplica hacia atrás asumiendo que
 * no cambió: si alguien lo edita en Ajustes, el historial completo se
 * relee con el molde nuevo. Sin molde declarado cae al genérico de
 * actividad (`EJERCICIO_META_MIN`), el mismo default que ya usa la lectura
 * semanal de `exerciseInsight` en `lib/insights.ts`.
 */
export function metaDelDia(
  fechaISO: string,
  timePerDay: Record<string, number> | null | undefined,
): number {
  const declarado = timePerDay?.[claveDeDia(fechaISO)];
  return typeof declarado === "number" && declarado > 0 ? declarado : EJERCICIO_META_MIN;
}

export type EstadoCumplimiento = "hecho" | "parcial" | "nada" | "sin_dato";

/** La mitad de la meta o más ya cuenta como "parcial" — no es todo o nada. */
const UMBRAL_PARCIAL = 0.5;

/**
 * Hecho: llegaste o pasaste la meta del día. Parcial: la mitad o más.
 * Nada: menos de la mitad. Sin dato: el reloj no trajo minutos ese día —
 * NO es lo mismo que "nada": es "no sé", igual que un anillo vacío en
 * `ActivityRings` no es lo mismo que un anillo en cero.
 */
export function estadoDelDia(minutos: number | null | undefined, meta: number): EstadoCumplimiento {
  if (minutos === null || minutos === undefined) return "sin_dato";
  if (minutos >= meta) return "hecho";
  if (minutos >= meta * UMBRAL_PARCIAL) return "parcial";
  return "nada";
}
