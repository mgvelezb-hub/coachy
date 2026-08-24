/**
 * Tendencia y pronóstico de la cintura (Fase 3).
 *
 * Regresión lineal por mínimos cuadrados sobre las últimas semanas
 * **concluyentes**, con banda de incertidumbre. Determinista, sin IA y sin
 * suavizados que escondan el ruido: si con estos datos no se puede pronosticar,
 * lo dice en lugar de inventar una línea.
 *
 * Módulo puro: no toca la base ni el reloj.
 */

/** Un punto de la serie. `inconclusive` viene del motor (regla R1), no del ciclo. */
export interface TrendPoint {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  value: number;
  inconclusive?: boolean;
}

export interface LinearFit {
  /** Pendiente en unidades por semana (cm/semana para la cintura). */
  slopePerWeek: number;
  /** Valor ajustado en la primera fecha de la ventana. */
  intercept: number;
  /** Bondad del ajuste, 0-1. `null` cuando no hay varianza que explicar. */
  r2: number | null;
  n: number;
  /** Error estándar de los residuos. `null` con menos de 3 puntos. */
  residualSd: number | null;
}

/** Ventana del pronóstico: entre 4 y 6 semanas concluyentes (visión v2 §F3). */
export const FORECAST_MIN_WEEKS = 4;
export const FORECAST_MAX_WEEKS = 6;
/** Con menos de esto no hay tendencia, hay dos puntos y una regla. */
export const MIN_POINTS_FOR_FIT = 2;

export const TWO_WEEKS_WARNING =
  "Dos semanas no hacen una tendencia. Esto es una proyección aritmética del ritmo reciente, no una promesa.";

/**
 * Semanas transcurridas entre dos fechas ISO. Fracciona a propósito: si un
 * check-in llegó con tres días de retraso, la pendiente no debe fingir que la
 * semana duró siete días exactos.
 */
function weeksBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  return (b - a) / (7 * 86_400_000);
}

/** Solo semanas concluyentes, en orden, y a lo mucho las últimas `max`. */
export function forecastWindow(
  points: TrendPoint[],
  max: number = FORECAST_MAX_WEEKS,
): TrendPoint[] {
  const usable = points
    .filter((point) => !point.inconclusive && Number.isFinite(point.value))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  return usable.slice(-max);
}

/** Mínimos cuadrados con x en semanas desde el primer punto de la ventana. */
export function linearFit(points: TrendPoint[]): LinearFit | null {
  if (points.length < MIN_POINTS_FOR_FIT) return null;

  const base = points[0]!.date;
  const xs = points.map((point) => weeksBetween(base, point.date));
  const ys = points.map((point) => point.value);
  const n = points.length;

  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;

  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - meanX;
    sxx += dx * dx;
    sxy += dx * (ys[i]! - meanY);
  }

  // Todos los check-ins el mismo día: no hay eje x sobre el que regresar.
  if (sxx === 0) return null;

  const slopePerWeek = sxy / sxx;
  const intercept = meanY - slopePerWeek * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i += 1) {
    const predicted = intercept + slopePerWeek * xs[i]!;
    ssRes += (ys[i]! - predicted) ** 2;
    ssTot += (ys[i]! - meanY) ** 2;
  }

  return {
    slopePerWeek,
    intercept,
    n,
    r2: ssTot === 0 ? null : 1 - ssRes / ssTot,
    // Con 2 puntos la recta pasa por ambos: el residuo es 0 y mentiría.
    residualSd: n > 2 ? Math.sqrt(ssRes / (n - 2)) : null,
  };
}

export interface Forecast {
  /** Semanas hacia adelante desde el último check-in de la ventana. */
  weeksAhead: number;
  /** Fecha proyectada, ISO. */
  targetDate: string;
  /** Valor actual (último punto concluyente). */
  currentValue: number;
  projected: number;
  /** Banda de incertidumbre. Igual a `projected` cuando no se puede calcular. */
  low: number;
  high: number;
  slopePerWeek: number;
  n: number;
  r2: number | null;
  /** Hay suficientes semanas concluyentes para que la proyección se sostenga. */
  confident: boolean;
  /** Texto honesto sobre lo que esta proyección no es. */
  warning: string;
}

/** Factor de la banda: ~95 % con muestras chicas, sin traer una tabla t. */
const BAND_FACTOR = 2;

function addWeeks(iso: string, weeks: number): string {
  const ms = Date.parse(`${iso}T00:00:00.000Z`) + weeks * 7 * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * "A este ritmo: X cm en N semanas", con banda.
 *
 * La banda es el intervalo de predicción de la regresión. Con 2 o 3 puntos no
 * hay grados de libertad para estimarla: en ese caso la banda colapsa al punto
 * y `confident` va en `false`, para que la UI no la pinte como certeza.
 */
export function forecast(
  points: TrendPoint[],
  weeksAhead = 4,
  windowMax: number = FORECAST_MAX_WEEKS,
): Forecast | null {
  const window = forecastWindow(points, windowMax);
  const fit = linearFit(window);
  if (!fit) return null;

  const base = window[0]!.date;
  const last = window[window.length - 1]!;
  const xLast = weeksBetween(base, last.date);
  const xTarget = xLast + weeksAhead;

  const projected = fit.intercept + fit.slopePerWeek * xTarget;

  let half = 0;
  if (fit.residualSd !== null) {
    const xs = window.map((point) => weeksBetween(base, point.date));
    const n = xs.length;
    const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
    const sxx = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
    const leverage = 1 + 1 / n + (xTarget - meanX) ** 2 / sxx;
    half = BAND_FACTOR * fit.residualSd * Math.sqrt(leverage);
  }

  return {
    weeksAhead,
    targetDate: addWeeks(last.date, weeksAhead),
    currentValue: round1(last.value),
    projected: round1(projected),
    low: round1(projected - half),
    high: round1(projected + half),
    slopePerWeek: Math.round(fit.slopePerWeek * 100) / 100,
    n: window.length,
    r2: fit.r2 === null ? null : Math.round(fit.r2 * 100) / 100,
    confident: window.length >= FORECAST_MIN_WEEKS,
    warning: TWO_WEEKS_WARNING,
  };
}
