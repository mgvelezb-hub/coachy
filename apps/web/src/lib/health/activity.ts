/**
 * Lectura de los datos del reloj: bandas de actividad y readiness.
 *
 * Todo aquí es puro. Recibe días ya leídos de `health_days` y devuelve señales;
 * no toca Prisma, ni el reloj del sistema, ni la red. Es lo que permite probar
 * la fórmula del PAL sin base de datos.
 *
 * **Qué no hace**: no diagnostica, no cambia cargas solo, y no le enseña al
 * admin la noche de nadie. Los pasos son un proxy de la actividad que el
 * cuestionario no ve (el NEAT: caminar, escaleras, hacer el súper); el sueño
 * es una nota para ella, no una orden para el motor.
 */

/** Un día del reloj, ya normalizado. `null` = ese día no trajo ese dato. */
export type HealthDayInput = {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  steps: number | null;
  activeKcal?: number | null;
  exerciseMin?: number | null;
  sleepMin: number | null;
  restingHr?: number | null;
  /** Variabilidad cardiaca (SDNN, ms): proxy de recuperación. */
  hrvMs?: number | null;
  /** VO₂ máx estimado (mL/kg/min). */
  vo2max?: number | null;
  respiratoryRate?: number | null;
  spo2?: number | null;
  standHours?: number | null;
};

/** Bandas de actividad por pasos diarios promedio. */
export type ActivityBand = "sedentario" | "ligero" | "activo" | "muy_activo";

/**
 * Días mínimos con pasos para creerle al promedio.
 *
 * Dos semanas: menos que eso y una semana de vacaciones (o una de gripa) mueve
 * el TDEE de alguien por un accidente, no por un cambio de hábito.
 */
export const MIN_DAYS_FOR_PAL = 14;

/** Ventana que se mira hacia atrás. Más allá ya no describe cómo vive hoy. */
export const ACTIVITY_WINDOW_DAYS = 28;

/**
 * Cortes de banda, en pasos diarios promedio.
 *
 * Son los cortes de uso común en la literatura de actividad (Tudor-Locke):
 * <5k sedentario, 5-8k poco activo, 8-12k activo, >12k muy activo.
 */
const BANDS: Array<{ band: ActivityBand; minSteps: number; palDelta: number; label: string }> = [
  { band: "muy_activo", minSteps: 12_000, palDelta: 0.1, label: "muy activo" },
  { band: "activo", minSteps: 8_000, palDelta: 0.05, label: "activo" },
  { band: "ligero", minSteps: 5_000, palDelta: 0, label: "ligero" },
  { band: "sedentario", minSteps: 0, palDelta: -0.05, label: "sedentario" },
];

export function bandForSteps(avgSteps: number): ActivityBand {
  const found = BANDS.find((entry) => avgSteps >= entry.minSteps);
  return found?.band ?? "sedentario";
}

export function bandLabel(band: ActivityBand): string {
  return BANDS.find((entry) => entry.band === band)?.label ?? "ligero";
}

/** Cuánto mueve esa banda al coeficiente base del PAL. */
export function palDeltaForBand(band: ActivityBand): number {
  return BANDS.find((entry) => entry.band === band)?.palDelta ?? 0;
}

export type ActivityWindow = {
  /** Días con pasos dentro de la ventana. */
  days: number;
  avgSteps: number;
  band: ActivityBand;
  /** Promedio de sueño en minutos, si hubo noches registradas. */
  avgSleepMin: number | null;
  /** Días con sueño registrado. */
  sleepDays: number;
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Resumen de la ventana de actividad.
 *
 * Un día sin pasos no cuenta como cero: cuenta como día sin dato. La diferencia
 * importa — el reloj se queda sin batería y eso no es sedentarismo.
 */
export function summarizeActivity(days: HealthDayInput[]): ActivityWindow | null {
  const steps = days.map((day) => day.steps).filter((value): value is number => value !== null);
  const sleep = days.map((day) => day.sleepMin).filter((value): value is number => value !== null);

  if (steps.length === 0 && sleep.length === 0) return null;

  const avgSteps = Math.round(mean(steps));

  return {
    days: steps.length,
    avgSteps,
    band: bandForSteps(avgSteps),
    avgSleepMin: sleep.length > 0 ? Math.round(mean(sleep)) : null,
    sleepDays: sleep.length,
  };
}

/** Límites del coeficiente base del PAL en el esquema del motor. */
const BASE_MIN = 1;
const BASE_MAX = 1.5;

export type PalAdjustment = {
  band: ActivityBand;
  avgSteps: number;
  days: number;
  /** Coeficiente base ya ajustado, listo para `loadConfig({ pal: { base } })`. */
  base: number;
  /** Cuánto se movió respecto al default del motor. */
  delta: number;
};

/**
 * PAL dinámico: pasos promedio → coeficiente base del motor.
 *
 * El motor calcula `PAL = base + 0.06·días de pesas + 0.0006·min de cardio +
 * 0.1·(trabajo activo)` y lo acota a 1.2-1.9. Los tres sumandos ya cuentan el
 * entreno declarado; lo que no ve nadie es el resto del día. Eso es lo que
 * corrigen los pasos, moviendo **solo el término base**:
 *
 * | Pasos/día promedio | Banda | Δ base |
 * |---|---|---|
 * | < 5,000 | sedentario | −0.05 |
 * | 5,000 – 7,999 | ligero | 0 |
 * | 8,000 – 11,999 | activo | +0.05 |
 * | ≥ 12,000 | muy activo | +0.10 |
 *
 * Con el default (1.20) el base queda entre 1.15 y 1.30 — dentro del rango que
 * el esquema del motor admite (1.0-1.5) — y el PAL resultante lo sigue
 * acotando el motor a 1.2-1.9. La corrección es deliberadamente chica: mueve
 * el TDEE a lo mucho ~4-8 %, porque los pasos son un proxy, no una medición.
 *
 * Sin `MIN_DAYS_FOR_PAL` días con pasos devuelve `null` y el motor corre con
 * sus defaults, exactamente como antes de la Fase 8.
 */
export function palAdjustment(
  window: ActivityWindow | null,
  defaultBase: number,
): PalAdjustment | null {
  if (!window || window.days < MIN_DAYS_FOR_PAL) return null;

  const delta = palDeltaForBand(window.band);
  if (delta === 0) return null;

  const base = Math.min(BASE_MAX, Math.max(BASE_MIN, Number((defaultBase + delta).toFixed(3))));
  if (base === defaultBase) return null;

  return { band: window.band, avgSteps: window.avgSteps, days: window.days, base, delta };
}

// --- Readiness --------------------------------------------------------------

/** Bajo este umbral la noche cuenta como corta. */
export const SHORT_SLEEP_MIN = 6 * 60;

/**
 * Nota de readiness para el modo gimnasio.
 *
 * Solo texto: **las cargas no se tocan solas**. Autoregular es decisión de
 * quien tiene la barra en las manos; el dato nada más se lo pone enfrente.
 * Devuelve `null` si anoche no hubo dato o si durmió lo suficiente.
 */
export function readinessNote(lastNightSleepMin: number | null): string | null {
  if (lastNightSleepMin === null || lastNightSleepMin <= 0) return null;
  if (lastNightSleepMin >= SHORT_SLEEP_MIN) return null;

  const hours = Math.floor(lastNightSleepMin / 60);
  const minutes = lastNightSleepMin % 60;
  const slept = minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;

  return `Anoche dormiste ${slept}. Hoy vale bajar un escalón de peso y quedarte con la técnica: entrenar cansada no suma, y la semana es larga.`;
}
