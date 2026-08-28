/**
 * Rachas — lógica PURA (sin llamadas de red ni React) para "Hoy"
 * (`src/app/(tabs)/index.tsx`) y "Tu resumen" (`src/app/resumen.tsx`).
 *
 * Hay DOS rachas y no significan lo mismo:
 *
 * 1. `trainingDays()` — **racha de entrenamiento**, la que se enseña en Hoy.
 *    Solo cuenta un día si HUBO ENTRENAMIENTO: una sesión de gym completada o
 *    una actividad registrada (natación, box, bici, funcional...). Tener el
 *    reloj puesto NO es entrenar: los pasos y el sueño quedan fuera a
 *    propósito — contarlos convertía "caminé al súper" en un día de racha y la
 *    cifra dejaba de significar nada para quien sí fue al gimnasio.
 *
 * 2. `activeDays()` — **racha de constancia con la app**: además del
 *    entrenamiento, cuentan el check-in y los días con datos del reloj. Sirve
 *    para "Tu resumen", donde el punto es no soltar el hábito, no la carga.
 *
 * Un "día activo" (`activeDays`) es cualquier día en que pasó AL MENOS UNA de:
 *  - una sesión de gym completada (`getHistoryTraining().sessions`)
 *  - un check-in (`getCheckins()`)
 *  - un día con datos del reloj (`getHealthDays().dias`)
 *  - una actividad del reloj registrada (`getActivities().actividades`)
 *
 * Nota de contrato: `TrainingHistoryRow` (el shape real de
 * `getHistoryTraining().sessions` en `src/lib/api.ts`) trae `completed:
 * boolean` + `date`, no un campo `completedAt` — es el equivalente aplanado
 * que ya expone el backend (`apps/web/src/lib/training/view.ts`), así que
 * una sesión cuenta cuando `completed` es `true`.
 */

import type { Activity, CheckInRow, HealthDayPayload, TrainingHistoryRow } from "@/lib/api";

export type StreakInput = {
  sessions?: TrainingHistoryRow[];
  checkIns?: CheckInRow[];
  healthDays?: HealthDayPayload[];
  activities?: Activity[];
};

/** yyyy-MM-dd — recorta cualquier componente de hora que venga pegado a la fecha. */
function toDateKey(value: string): string {
  return value.slice(0, 10);
}

/**
 * yyyy-MM-dd de hoy en hora LOCAL del teléfono (no UTC: evita cruzar de día
 * cerca de medianoche). Mismo criterio que `todayISO()` en
 * `src/app/(tabs)/checkin.tsx`.
 */
export function todayISO(reference: Date = new Date()): string {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, "0");
  const day = String(reference.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** yyyy-MM-dd + N días (N puede ser negativo), en UTC para no arrastrar DST. */
function shiftDate(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

/** Junta las fechas de las 3 fuentes en un solo Set de días activos (yyyy-MM-dd). */
export function activeDays(input: StreakInput): Set<string> {
  const days = new Set<string>();

  for (const session of input.sessions ?? []) {
    if (session.completed && session.date) days.add(toDateKey(session.date));
  }
  for (const checkIn of input.checkIns ?? []) {
    if (checkIn.date) days.add(toDateKey(checkIn.date));
  }
  for (const day of input.healthDays ?? []) {
    if (day.date) days.add(toDateKey(day.date));
  }
  for (const activity of input.activities ?? []) {
    if (activity.date) days.add(toDateKey(activity.date));
  }

  return days;
}

/**
 * Días con ENTRENAMIENTO real: gym completado o actividad registrada. Nunca
 * pasos, nunca check-in — ver la nota de arriba.
 */
export function trainingDays(input: StreakInput): Set<string> {
  const days = new Set<string>();

  for (const session of input.sessions ?? []) {
    if (session.completed && session.date) days.add(toDateKey(session.date));
  }
  for (const activity of input.activities ?? []) {
    if (activity.date) days.add(toDateKey(activity.date));
  }

  return days;
}

/** De qué está hecha la racha de entrenamiento, para poder decirlo en la
 * tarjeta: "3 en el gym · 2 de otra disciplina" en vez de un número pelón. */
export function trainingBreakdown(input: StreakInput): { gym: number; actividades: number } {
  const gym = new Set<string>();
  const actividades = new Set<string>();

  for (const session of input.sessions ?? []) {
    if (session.completed && session.date) gym.add(toDateKey(session.date));
  }
  for (const activity of input.activities ?? []) {
    if (activity.date && !gym.has(toDateKey(activity.date))) actividades.add(toDateKey(activity.date));
  }

  return { gym: gym.size, actividades: actividades.size };
}

/**
 * Racha actual: días consecutivos activos contando hacia atrás desde `today`.
 *
 * Decisión de producto: HOY cuenta si está activo. Si HOY todavía no tiene
 * actividad pero AYER sí, la racha se considera viva de todos modos — el día
 * de hoy no ha terminado, así que no se corta la racha solo porque la atleta
 * "todavía" no ha hecho nada. Solo se rompe cuando ni hoy ni ayer están
 * activos.
 */
export function currentStreak(days: Set<string>, today: string): number {
  const startsToday = days.has(today);
  const cursor = startsToday ? today : shiftDate(today, -1);
  if (!days.has(cursor)) return 0;

  let streak = 0;
  let pointer = cursor;
  while (days.has(pointer)) {
    streak += 1;
    pointer = shiftDate(pointer, -1);
  }
  return streak;
}

/** La racha más larga de días consecutivos activos en todo el historial. */
export function bestStreak(days: Set<string>): number {
  if (days.size === 0) return 0;

  const sorted = [...days].sort();
  let best = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1]!;
    const value = sorted[i]!;
    current = shiftDate(previous, 1) === value ? current + 1 : 1;
    best = Math.max(best, current);
  }

  return best;
}

/**
 * Línea cálida para "Tu resumen", según el tramo de la racha actual. La
 * metodología del coach es "ante desánimo normalizar, nunca regañar": en 0
 * SIEMPRE invita, nunca culpa ni menciona que se "rompió" nada.
 */
export function streakMessage(streak: number): string {
  if (streak === 0) return "Hoy es un gran día para empezar. Un solo día ya cuenta.";
  if (streak <= 3) return "Ya prendiste la mecha — un día más y esto se vuelve hábito.";
  if (streak <= 9) return "Esto ya es una racha de verdad. Se nota la constancia.";
  return "Racha larga. Esto ya es parte de quién eres, no un esfuerzo extra.";
}
