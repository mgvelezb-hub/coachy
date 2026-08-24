/**
 * Las cifras de "Tu avance".
 *
 * Todo aquí es determinista y puro: entra el historial, salen números. Ni el
 * reloj ni la base ni la IA participan — la fecha de hoy llega como dato.
 *
 * Existe porque el historial sin interpretación es una galería: gráficas
 * bonitas que no contestan "¿voy bien?". Estas cifras son la respuesta, y son
 * también **lo único** que la redacción de Coachy tiene permitido citar.
 *
 * Regla de la metodología que manda sobre todas: **la cinta pesa más que la
 * báscula**. El peso se reporta, pero nunca es el titular.
 */

/** Un check-in aplanado a lo que el resumen necesita. */
export interface ProgressCheckIn {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  waistCm: number | null;
  weightKg: number | null;
  /**
   * Semana no concluyente: fase lútea o menstruación. El motor ya las descuenta
   * del estancamiento (regla R1) y aquí se descuentan de la tendencia.
   */
  inconclusive: boolean;
}

export interface ProgressRecord {
  exerciseName: string;
  weightKg: number;
  reps: number;
  /** ISO `YYYY-MM-DD`. */
  date: string;
}

export interface ProgressInput {
  checkIns: readonly ProgressCheckIn[];
  records: readonly ProgressRecord[];
  /** Hoy, ISO `YYYY-MM-DD`. El módulo no lee el reloj. */
  today: string;
}

export interface Delta {
  /** Diferencia con signo: negativo = bajó. */
  value: number;
  fromDate: string;
  toDate: string;
  /** Semanas entre las dos mediciones, redondeadas. */
  weeks: number;
}

export interface ProgressMetrics {
  /** Cintura: del primer registro con dato al último. */
  waistTotal: Delta | null;
  /** Cintura en la ventana reciente, solo con semanas concluyentes. */
  waistRecent: Delta | null;
  /** Peso: del primero al último registro con dato. */
  weight: Delta | null;
  /** El récord más reciente del gimnasio. */
  bestRecord: ProgressRecord | null;
  /** Check-ins seguidos, contando hacia atrás desde el último. */
  streakWeeks: number;
  /** Fecha del último check-in, con o sin medidas. */
  lastCheckInDate: string | null;
  /** Días desde el último check-in hasta hoy. */
  daysSinceLastCheckIn: number | null;
  totalCheckIns: number;
}

const DAY_MS = 86_400_000;

/** Ventana de la tendencia reciente: cuatro semanas. */
export const RECENT_WINDOW_DAYS = 28;

/** Hasta 10 días entre check-ins sigue siendo cadencia semanal. */
const STREAK_GAP_DAYS = 10;

function time(iso: string): number {
  return new Date(`${iso}T12:00:00.000Z`).getTime();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((time(to) - time(from)) / DAY_MS);
}

function deltaOf(
  first: { date: string; value: number },
  last: { date: string; value: number },
): Delta {
  const days = daysBetween(first.date, last.date);
  return {
    value: Number((last.value - first.value).toFixed(1)),
    fromDate: first.date,
    toDate: last.date,
    weeks: Math.max(1, Math.round(days / 7)),
  };
}

function seriesOf(
  checkIns: readonly ProgressCheckIn[],
  field: "waistCm" | "weightKg",
): Array<{ date: string; value: number }> {
  return checkIns
    .filter((checkIn) => checkIn[field] !== null)
    .map((checkIn) => ({ date: checkIn.date, value: checkIn[field] as number }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function totalDelta(series: Array<{ date: string; value: number }>): Delta | null {
  const first = series[0];
  const last = series[series.length - 1];
  if (first === undefined || last === undefined || first.date === last.date) return null;
  return deltaOf(first, last);
}

/** Racha: check-ins seguidos con cadencia semanal, contando desde el último. */
export function streakOf(checkIns: readonly ProgressCheckIn[]): number {
  const dates = checkIns.map((checkIn) => checkIn.date).sort();
  if (dates.length === 0) return 0;

  let streak = 1;
  for (let i = dates.length - 1; i > 0; i -= 1) {
    const gap = daysBetween(dates[i - 1] as string, dates[i] as string);
    if (gap > STREAK_GAP_DAYS) break;
    streak += 1;
  }
  return streak;
}

export function computeProgressMetrics(input: ProgressInput): ProgressMetrics {
  const checkIns = [...input.checkIns].sort((a, b) => (a.date < b.date ? -1 : 1));

  const waist = seriesOf(checkIns, "waistCm");
  const weight = seriesOf(checkIns, "weightKg");

  // Tendencia reciente: solo semanas concluyentes, dentro de la ventana que
  // termina en la última medición útil. Con una sola medición no hay tendencia.
  const conclusive = seriesOf(
    checkIns.filter((checkIn) => !checkIn.inconclusive),
    "waistCm",
  );
  const anchor = conclusive[conclusive.length - 1];
  const window = anchor
    ? conclusive.filter((point) => daysBetween(point.date, anchor.date) <= RECENT_WINDOW_DAYS)
    : [];
  const waistRecent =
    window.length >= 2
      ? deltaOf(window[0] as { date: string; value: number }, anchor as { date: string; value: number })
      : null;

  const bestRecord =
    [...input.records].sort(
      (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.weightKg - a.weightKg),
    )[0] ?? null;

  const lastCheckInDate = checkIns[checkIns.length - 1]?.date ?? null;

  return {
    waistTotal: totalDelta(waist),
    waistRecent,
    weight: totalDelta(weight),
    bestRecord,
    streakWeeks: streakOf(checkIns),
    lastCheckInDate,
    daysSinceLastCheckIn:
      lastCheckInDate === null ? null : daysBetween(lastCheckInDate, input.today),
    totalCheckIns: checkIns.length,
  };
}

/** `-1.5` → `−1.5 cm`; `0` → `sin cambio`. */
export function formatDelta(value: number, unit: string): string {
  if (Math.abs(value) < 0.05) return "sin cambio";
  const sign = value < 0 ? "−" : "+";
  return `${sign}${Math.abs(value).toFixed(1)} ${unit}`;
}

/**
 * El resumen escrito por nosotros, sin IA.
 *
 * Es el respaldo cuando no hay `ANTHROPIC_API_KEY` o cuando la redacción cita
 * un número que no salió del historial. Sigue las mismas reglas duras: la cinta
 * manda, cero comentario estético, cero consejo médico.
 */
export function templateSummary(metrics: ProgressMetrics): string[] {
  const lines: string[] = [];
  const { waistTotal, waistRecent, weight, bestRecord } = metrics;

  if (waistTotal === null && waistRecent === null) {
    lines.push(
      metrics.totalCheckIns === 0
        ? "Todavía no hay historial que leer. Tu primer check-in con medidas arranca la cuenta."
        : "Aún no hay dos mediciones de cintura que comparar: en cuanto mandes la siguiente, aquí aparece la tendencia.",
    );
  }

  if (waistTotal !== null) {
    lines.push(
      waistTotal.value < 0
        ? `Desde tu primer registro la cintura va ${formatDelta(waistTotal.value, "cm")} en ${waistTotal.weeks} semanas. Esa es la cifra que importa.`
        : `Desde tu primer registro la cintura va ${formatDelta(waistTotal.value, "cm")} en ${waistTotal.weeks} semanas. Es el punto de partida real, no una sentencia.`,
    );
  }

  if (waistRecent !== null) {
    lines.push(
      waistRecent.value < 0
        ? `En las últimas semanas concluyentes bajó ${formatDelta(waistRecent.value, "cm").replace("−", "")}: la dirección de ahorita es la correcta.`
        : waistRecent.value > 0
          ? "En las últimas semanas concluyentes la cinta no bajó. Toca ajustar, no apretar más de la cuenta."
          : "En las últimas semanas concluyentes la cinta se quedó igual: eso es información, no un retroceso.",
    );
  }

  if (weight !== null && waistTotal !== null && weight.value > 0 && waistTotal.value < 0) {
    lines.push(
      `La báscula marca ${formatDelta(weight.value, "kg")} mientras la cintura baja: eso es recomposición, y la cinta pesa más que la báscula.`,
    );
  } else if (weight !== null) {
    lines.push(`El peso se movió ${formatDelta(weight.value, "kg")} en el mismo periodo.`);
  }

  if (bestRecord !== null) {
    lines.push(
      `Tu mejor marca reciente son ${bestRecord.weightKg} kg × ${bestRecord.reps} reps: la fuerza subiendo es la señal de que el músculo se queda.`,
    );
  }

  if (metrics.streakWeeks >= 2) {
    lines.push(`Llevas ${metrics.streakWeeks} check-ins seguidos. Esa constancia es la que construye.`);
  }

  return lines.slice(0, 4);
}

/**
 * Los números que la redacción tiene permitido citar, ya en texto.
 *
 * Es el candado: lo que no está en esta lista, Coachy no lo puede escribir.
 */
export function citableNumbers(metrics: ProgressMetrics): number[] {
  const numbers: number[] = [metrics.totalCheckIns, metrics.streakWeeks];

  for (const delta of [metrics.waistTotal, metrics.waistRecent, metrics.weight]) {
    if (delta === null) continue;
    numbers.push(Math.abs(delta.value), delta.weeks);
  }
  if (metrics.bestRecord) {
    numbers.push(metrics.bestRecord.weightKg, metrics.bestRecord.reps);
  }
  if (metrics.daysSinceLastCheckIn !== null) numbers.push(metrics.daysSinceLastCheckIn);

  return [...new Set(numbers)];
}
