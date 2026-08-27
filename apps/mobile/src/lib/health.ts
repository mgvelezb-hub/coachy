import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  CategoryValueSleepAnalysis,
  isHealthDataAvailable,
  queryCategorySamples,
  queryStatisticsCollectionForQuantity,
  requestAuthorization,
  type CategorySampleTyped,
  type ObjectTypeIdentifier,
  type QueryStatisticsResponse,
} from "@kingstinct/react-native-healthkit";

import { getHealthDays as fetchHealthDays, postHealthDays, type HealthDayPayload } from "@/lib/api";

/**
 * Fase N5 — HealthKit directo, adiós al Atajo de iOS.
 *
 * Todo esto es SOLO LECTURA: nunca se escribe nada en Salud, y nunca se
 * interpreta clínicamente lo que se lee — la app únicamente transporta los
 * números que ya calculó HealthKit hacia `POST /api/v1/health` (ver
 * apps/web/src/lib/health/schema.ts para los topes exactos).
 *
 * ⚠️ Trampa de la librería (@kingstinct/react-native-healthkit): pedir datos
 * de un tipo que nunca se autorizó con `requestAuthorization` TIRA la app
 * (no lanza una promesa rechazada, crashea de verdad — así lo advierte su
 * README). Por eso nada de este módulo hace una query de HealthKit sin haber
 * pasado antes por `connectHealth()`, y ese estado se guarda en AsyncStorage
 * (`isHealthConnected`) — es la app llevando la cuenta de "ya pedí permiso",
 * no HealthKit diciéndolo.
 */

// ---------------------------------------------------------------------------
// Tipos y permisos
// ---------------------------------------------------------------------------

/** Los 5 tipos que la app lee. Nada de peso, nutrición ni nada clínico. */
export const HEALTH_TYPES = [
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierAppleExerciseTime",
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKQuantityTypeIdentifierRestingHeartRate",
] as const satisfies readonly ObjectTypeIdentifier[];

const CONNECTED_KEY = "holygains:health:connected";
const LAST_SYNC_KEY = "holygains:health:lastSync";

/** `true` si esta instalación de la app ya pasó por `connectHealth()` una vez.
 * Es la única señal que existe: iOS NUNCA revela si el usuario negó lectura
 * (`requestAuthorization` resuelve igual haya aceptado o rechazado), así que
 * "conectado" aquí significa "ya se le preguntó", no "ya dijo que sí". Que
 * después no lleguen datos es un estado legítimo, no un error. */
export async function isHealthConnected(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  const value = await AsyncStorage.getItem(CONNECTED_KEY).catch(() => null);
  return value === "1";
}

/**
 * Pide autorización de lectura para `HEALTH_TYPES`. Nunca lanza: si algo
 * falla (Salud no disponible, simulador, excepción nativa) regresa `false`.
 */
export async function requestHealthPermissions(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;

  try {
    const available = await isHealthDataAvailable();
    if (!available) return false;

    // Resuelve `true` en cuanto el diálogo se pudo mostrar (o ya se había
    // mostrado antes) — no dice qué eligió la persona. Ver nota de arriba.
    return await requestAuthorization({ toRead: [...HEALTH_TYPES] });
  } catch {
    return false;
  }
}

/** Botón "Conectar Apple Salud" de Ajustes: pide permiso y, si se pudo pedir,
 * marca esta instalación como conectada (habilita las queries de ahí en
 * adelante). */
export async function connectHealth(): Promise<boolean> {
  const granted = await requestHealthPermissions();
  if (granted) {
    await AsyncStorage.setItem(CONNECTED_KEY, "1").catch(() => {});
  }
  return granted;
}

// ---------------------------------------------------------------------------
// Lectura y agregación por día LOCAL
// ---------------------------------------------------------------------------

/** `yyyy-MM-dd` en hora local del teléfono — nunca UTC, para no cruzar de día
 * cerca de medianoche (mismo patrón que `checkin.tsx`). */
function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function bucketDateKey(bucket: QueryStatisticsResponse): string | null {
  return bucket.startDate ? localDateKey(bucket.startDate) : null;
}

function applySum(
  byDate: Map<string, HealthDayPayload>,
  buckets: readonly QueryStatisticsResponse[],
  field: "steps" | "activeKcal" | "exerciseMin",
): void {
  for (const bucket of buckets) {
    const key = bucketDateKey(bucket);
    const day = key ? byDate.get(key) : undefined;
    const value = bucket.sumQuantity?.quantity;
    if (!day || value === undefined) continue;
    day[field] = Math.round(value);
  }
}

function applyAverage(
  byDate: Map<string, HealthDayPayload>,
  buckets: readonly QueryStatisticsResponse[],
  field: "restingHr",
): void {
  for (const bucket of buckets) {
    const key = bucketDateKey(bucket);
    const day = key ? byDate.get(key) : undefined;
    const value = bucket.averageQuantity?.quantity;
    if (!day || value === undefined) continue;
    day[field] = Math.round(value);
  }
}

/** `true` para las muestras que cuentan como dormido — excluye "en cama" y
 * "despierto" (los dos estados que el Atajo de iOS confundía con sueño real,
 * lo que ya nos costó una sesión completa de debugging). */
function isAsleep(value: CategorySampleTyped<"HKCategoryTypeIdentifierSleepAnalysis">["value"]): boolean {
  return value !== CategoryValueSleepAnalysis.inBed && value !== CategoryValueSleepAnalysis.awake;
}

/** Suma minutos dormidos por día. Igual que el criterio del servidor (ver
 * apps/web/src/lib/health/db.ts): la noche se cuenta en el día en que la
 * persona SE DESPERTÓ (`endDate`), no en el que se acostó — así una noche que
 * cruza medianoche no se parte entre dos días. */
function applySleep(
  byDate: Map<string, HealthDayPayload>,
  samples: readonly CategorySampleTyped<"HKCategoryTypeIdentifierSleepAnalysis">[],
): void {
  const totalsMs = new Map<string, number>();

  for (const sample of samples) {
    if (!isAsleep(sample.value)) continue;
    const key = localDateKey(sample.endDate);
    if (!byDate.has(key)) continue;
    totalsMs.set(key, (totalsMs.get(key) ?? 0) + (sample.endDate.getTime() - sample.startDate.getTime()));
  }

  for (const [key, ms] of totalsMs) {
    const day = byDate.get(key);
    if (day) day.sleepMin = Math.round(ms / 60_000);
  }
}

/**
 * Un objeto por día de los últimos `days` días, hasta AYER (nunca hoy: hoy
 * está incompleto mientras el reloj sigue registrando). Agregación en
 * calendario LOCAL — pasos/kcal activas/minutos de ejercicio se suman, FC en
 * reposo se promedia, sueño se suma en minutos excluyendo "en cama"/"despierto".
 * Un día sin muestras de un campo simplemente no trae ese campo (nunca 0).
 *
 * Asume que `connectHealth()` ya corrió alguna vez en esta instalación —
 * llamarla sin eso arriesga el crash que documenta la librería (ver el
 * comentario al inicio del archivo).
 */
export async function readDailyMetrics(days: number): Promise<HealthDayPayload[]> {
  if (Platform.OS !== "ios" || days <= 0) return [];

  const rangeEnd = startOfLocalDay(new Date()); // hoy 00:00 local — límite exclusivo, excluye hoy.
  const rangeStart = new Date(rangeEnd);
  rangeStart.setDate(rangeStart.getDate() - days);

  const byDate = new Map<string, HealthDayPayload>();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(rangeStart);
    d.setDate(d.getDate() + i);
    const key = localDateKey(d);
    byDate.set(key, { date: key });
  }

  const filter = { date: { startDate: rangeStart, endDate: rangeEnd } };
  const interval = { day: 1 };

  const [stepsBuckets, kcalBuckets, exerciseBuckets, hrBuckets, sleepSamples] = await Promise.all([
    queryStatisticsCollectionForQuantity(
      "HKQuantityTypeIdentifierStepCount",
      ["cumulativeSum"],
      rangeStart,
      interval,
      { unit: "count", filter },
    ),
    queryStatisticsCollectionForQuantity(
      "HKQuantityTypeIdentifierActiveEnergyBurned",
      ["cumulativeSum"],
      rangeStart,
      interval,
      { unit: "kcal", filter },
    ),
    queryStatisticsCollectionForQuantity(
      "HKQuantityTypeIdentifierAppleExerciseTime",
      ["cumulativeSum"],
      rangeStart,
      interval,
      { unit: "min", filter },
    ),
    queryStatisticsCollectionForQuantity(
      "HKQuantityTypeIdentifierRestingHeartRate",
      ["discreteAverage"],
      rangeStart,
      interval,
      { unit: "count/min", filter },
    ),
    queryCategorySamples("HKCategoryTypeIdentifierSleepAnalysis", { limit: 0, filter }),
  ]);

  applySum(byDate, stepsBuckets, "steps");
  applySum(byDate, kcalBuckets, "activeKcal");
  applySum(byDate, exerciseBuckets, "exerciseMin");
  applyAverage(byDate, hrBuckets, "restingHr");
  applySleep(byDate, sleepSamples);

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function hasAnyMetric(day: HealthDayPayload): boolean {
  return (
    day.steps != null ||
    day.activeKcal != null ||
    day.exerciseMin != null ||
    day.sleepMin != null ||
    day.restingHr != null
  );
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/** Lee `days` días de HealthKit y los manda en un lote. Nunca lanza al UI —
 * cualquier error (de HealthKit o de red) regresa `null`. Días completamente
 * vacíos (ni una muestra en ningún campo) no se mandan. */
export async function syncHealth(days = 30): Promise<{ enviados: number } | null> {
  if (Platform.OS !== "ios") return null;

  try {
    const readings = await readDailyMetrics(days);
    const withData = readings.filter(hasAnyMetric);
    if (withData.length === 0) return { enviados: 0 };

    await postHealthDays(withData);
    return { enviados: withData.length };
  } catch {
    return null;
  }
}

const FIRST_SYNC_DAYS = 30; // backfill inicial: el PAL necesita 14+ días con dato.
const ROUTINE_SYNC_DAYS = 7; // barato y corrige cualquier dato retroactivo.
const MIN_AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Sync automático (montaje de la app / vuelta a primer plano). No hace nada
 * si: no es iOS, esta instalación nunca conectó Salud (evita el crash de
 * consultar sin permiso pedido), o ya sincronizó hace menos de 6 h.
 */
export async function autoSyncHealth(): Promise<{ enviados: number } | null> {
  if (Platform.OS !== "ios") return null;
  if (!(await isHealthConnected())) return null;

  const lastSyncRaw = await AsyncStorage.getItem(LAST_SYNC_KEY).catch(() => null);
  const lastSync = lastSyncRaw ? Number(lastSyncRaw) : null;
  const now = Date.now();
  if (lastSync !== null && now - lastSync < MIN_AUTO_SYNC_INTERVAL_MS) return null;

  const days = lastSync === null ? FIRST_SYNC_DAYS : ROUTINE_SYNC_DAYS;
  const result = await syncHealth(days);
  if (result !== null) {
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(now)).catch(() => {});
  }
  return result;
}

// ---------------------------------------------------------------------------
// Datos para la tarjeta de Ajustes
// ---------------------------------------------------------------------------

export type HealthSummary = {
  lastDate: string | null;
  avgSteps: number | null;
};

/** Último dato recibido + promedio de pasos de los últimos días guardados en
 * el servidor (no vuelve a tocar HealthKit — lee lo que ya se sincronizó). */
export async function getHealthSummary(): Promise<HealthSummary> {
  const { dias } = await fetchHealthDays();
  if (dias.length === 0) return { lastDate: null, avgSteps: null };

  const steps = dias.map((d) => d.steps).filter((v): v is number => v != null);
  const avgSteps = steps.length > 0 ? Math.round(steps.reduce((sum, v) => sum + v, 0) / steps.length) : null;

  return { lastDate: dias[0]?.date ?? null, avgSteps };
}
