import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  CategoryValueSleepAnalysis,
  isHealthDataAvailable,
  queryCategorySamples,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
  WorkoutActivityType,
  type CategorySampleTyped,
  type ObjectTypeIdentifier,
  type QueryStatisticsResponse,
  type WorkoutProxyTyped,
} from "@kingstinct/react-native-healthkit";

import {
  getHealthDays as fetchHealthDays,
  postActivities,
  postHealthDays,
  type ActivityPayload,
  type Discipline,
  type HealthDayPayload,
} from "@/lib/api";

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

/** Los 7 tipos que la app lee. Nada de peso, nutrición ni nada clínico.
 * `HKWorkoutTypeIdentifier` habilita `queryWorkoutSamples` (entrenamientos) y
 * `HKQuantityTypeIdentifierHeartRate` habilita `workout.getStatistic(...)`
 * para el promedio/máximo de FC de cada entrenamiento — ambos se piden aquí
 * junto con los demás para no disparar el crash de "tipo nunca autorizado"
 * documentado abajo. */
export const HEALTH_TYPES = [
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierAppleExerciseTime",
  "HKCategoryTypeIdentifierSleepAnalysis",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKWorkoutTypeIdentifier",
  "HKQuantityTypeIdentifierHeartRate",
] as const satisfies readonly ObjectTypeIdentifier[];

const CONNECTED_KEY = "holygains:health:connected";
/**
 * Qué versión del set de permisos ya se le pidió a esta instalación.
 *
 * Existe porque `HEALTH_TYPES` crece: los entrenamientos se agregaron después
 * de que la gente ya había conectado Apple Salud. iOS solo pregunta por los
 * tipos que nunca se le han preguntado, así que sin esta versión la app se
 * quedaba creyendo "ya pedí todo" y jamás pedía los nuevos — leía vacío para
 * siempre. Subir este número obliga a volver a pedir; el diálogo del sistema
 * solo muestra lo que falte.
 */
const PERMISSIONS_VERSION = 2;
const PERMISSIONS_VERSION_KEY = "holygains:health:permissionsVersion";
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
    await AsyncStorage.setItem(PERMISSIONS_VERSION_KEY, String(PERMISSIONS_VERSION)).catch(() => {});
  }
  return granted;
}

/**
 * Vuelve a pedir permiso si `HEALTH_TYPES` creció desde la última vez.
 *
 * Es lo que evita el agujero: quien conectó Salud antes de que existieran los
 * entrenamientos tenía la bandera de "conectado" en true y nunca se le
 * preguntaba por los tipos nuevos. Consultar un tipo jamás autorizado además
 * puede tirar la app, así que esto corre ANTES de cualquier query.
 */
export async function ensureCurrentPermissions(): Promise<void> {
  const raw = await AsyncStorage.getItem(PERMISSIONS_VERSION_KEY).catch(() => null);
  if (Number(raw) >= PERMISSIONS_VERSION) return;

  const granted = await requestHealthPermissions();
  if (granted) {
    await AsyncStorage.setItem(PERMISSIONS_VERSION_KEY, String(PERMISSIONS_VERSION)).catch(() => {});
  }
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
// Entrenamientos (workouts) — Fase N6
// ---------------------------------------------------------------------------

/**
 * Mapeo HealthKit → disciplina de la app. ÚNICO lugar a tocar cuando se
 * agreguen disciplinas o se afine algún tipo de actividad — el resto del
 * flujo de sync no sabe nada de `WorkoutActivityType`.
 *
 * Decisiones de mapeo:
 * - `swimming` → NATACION.
 * - `boxing`/`kickboxing` → BOX.
 * - `squash` → SQUASH (HealthKit ya trae el tipo exacto, no hace falta
 *   caer a "racquet sports" genérico).
 * - `traditionalStrengthTraining` → PESAS.
 * - `functionalStrengthTraining`/metabólico mixto/core → FUNCIONAL;
 *   `crossTraining`/HIIT → CROSSFIT (HealthKit no distingue "crossfit" como
 *   tal — es la lectura más cercana de sus dos tipos de entrenamiento mixto).
 * - Cardio "de toda la vida" (correr, bici, caminar, elíptica, remo, escaleras,
 *   handbike, triatlón, cuerda) → CARDIO.
 * - Cualquier tipo no listado (yoga, baile, deportes de equipo/raqueta
 *   distintos de squash, etc.) → OTRO.
 */
export function disciplineFor(activityType: WorkoutActivityType): Discipline {
  switch (activityType) {
    case WorkoutActivityType.swimming:
      return "NATACION";

    case WorkoutActivityType.boxing:
    case WorkoutActivityType.kickboxing:
      return "BOX";

    case WorkoutActivityType.squash:
      return "SQUASH";

    case WorkoutActivityType.traditionalStrengthTraining:
      return "PESAS";

    case WorkoutActivityType.functionalStrengthTraining:
    case WorkoutActivityType.mixedMetabolicCardioTraining:
    case WorkoutActivityType.mixedCardio:
    case WorkoutActivityType.coreTraining:
      return "FUNCIONAL";

    case WorkoutActivityType.crossTraining:
    case WorkoutActivityType.highIntensityIntervalTraining:
      return "CROSSFIT";

    case WorkoutActivityType.running:
    case WorkoutActivityType.cycling:
    case WorkoutActivityType.walking:
    case WorkoutActivityType.elliptical:
    case WorkoutActivityType.rowing:
    case WorkoutActivityType.hiking:
    case WorkoutActivityType.stairs:
    case WorkoutActivityType.stairClimbing:
    case WorkoutActivityType.stepTraining:
    case WorkoutActivityType.jumpRope:
    case WorkoutActivityType.handCycling:
    case WorkoutActivityType.swimBikeRun:
    case WorkoutActivityType.wheelchairWalkPace:
    case WorkoutActivityType.wheelchairRunPace:
      return "CARDIO";

    default:
      return "OTRO";
  }
}

/** Topes EXACTOS de `apps/web/src/lib/health/schema.ts` (validador de
 * `/api/v1/activities`). Un workout que se sale de rango se DESCARTA aquí en
 * vez de mandarse y tumbar el lote entero en el servidor. */
function withinActivityRanges(activity: ActivityPayload): boolean {
  if (activity.durationMin < 1 || activity.durationMin > 1200) return false;
  if (activity.activeKcal != null && (activity.activeKcal < 0 || activity.activeKcal > 5000)) return false;
  if (activity.avgHr != null && (activity.avgHr < 30 || activity.avgHr > 240)) return false;
  if (activity.maxHr != null && (activity.maxHr < 30 || activity.maxHr > 240)) return false;
  if (activity.distanceM != null && (activity.distanceM < 0 || activity.distanceM > 100000)) return false;
  if (activity.notes != null && activity.notes.length > 1000) return false;
  return true;
}

/** FC promedio/máxima del workout. HealthKit puede no traer ninguna (reloj no
 * puesto, tipo de entrenamiento sin sensor, etc.) — "sin dato" es legítimo,
 * nunca se interpreta como error ni tumba el resto del workout. */
async function readWorkoutHeartRate(
  workout: WorkoutProxyTyped,
): Promise<{ avgHr: number | null; maxHr: number | null }> {
  try {
    const stats = await workout.getStatistic("HKQuantityTypeIdentifierHeartRate", "count/min");
    return {
      avgHr: stats?.averageQuantity ? Math.round(stats.averageQuantity.quantity) : null,
      maxHr: stats?.maximumQuantity ? Math.round(stats.maximumQuantity.quantity) : null,
    };
  } catch {
    return { avgHr: null, maxHr: null };
  }
}

/** Arma el payload de `/api/v1/activities` a partir de un workout de
 * HealthKit, o `null` si algún campo se sale de rango (se descarta, no se
 * manda a medias). */
async function buildActivityPayload(workout: WorkoutProxyTyped): Promise<ActivityPayload | null> {
  const durationMin = Math.round(workout.duration.quantity / 60);
  const activeKcal = workout.totalEnergyBurned ? Math.round(workout.totalEnergyBurned.quantity) : null;
  const distanceM = workout.totalDistance ? Math.round(workout.totalDistance.quantity) : null;
  const { avgHr, maxHr } = await readWorkoutHeartRate(workout);

  const activity: ActivityPayload = {
    discipline: disciplineFor(workout.workoutActivityType),
    source: "HEALTHKIT",
    externalId: workout.uuid,
    startedAt: workout.startDate.toISOString(),
    endedAt: workout.endDate.toISOString(),
    date: localDateKey(workout.startDate),
    durationMin,
    activeKcal,
    avgHr,
    maxHr,
    distanceM,
    notes: null,
  };

  return withinActivityRanges(activity) ? activity : null;
}

/**
 * Todos los entrenamientos de los últimos `days` días (incluye hoy: a
 * diferencia de las métricas diarias, un workout ya cerrado no tiene "día
 * incompleto" que esperar). Asume que `connectHealth()` ya corrió — mismo
 * contrato que `readDailyMetrics`.
 */
export async function readWorkouts(days: number): Promise<ActivityPayload[]> {
  if (Platform.OS !== "ios" || days <= 0) return [];

  const rangeEnd = new Date();
  const rangeStart = new Date(rangeEnd);
  rangeStart.setDate(rangeStart.getDate() - days);

  const workouts = await queryWorkoutSamples({
    filter: { date: { startDate: rangeStart, endDate: rangeEnd } },
    limit: 0, // 0 = todos los que haya en el rango, sin tope.
    ascending: false,
  });

  const activities: ActivityPayload[] = [];
  for (const workout of workouts) {
    try {
      const activity = await buildActivityPayload(workout);
      if (activity) activities.push(activity);
    } catch {
      // Un workout mal formado no debe tumbar el resto del lote.
    }
  }
  return activities;
}

const ACTIVITIES_BATCH_SIZE = 50; // tope de /api/v1/activities.

/** Lee `days` días de workouts y los manda en tandas de
 * `ACTIVITIES_BATCH_SIZE`. Nunca lanza al UI. */
export async function syncWorkouts(days = 30): Promise<{ enviados: number } | null> {
  if (Platform.OS !== "ios") return null;

  try {
    const activities = await readWorkouts(days);
    if (activities.length === 0) return { enviados: 0 };

    let enviados = 0;
    for (let i = 0; i < activities.length; i += ACTIVITIES_BATCH_SIZE) {
      const batch = activities.slice(i, i + ACTIVITIES_BATCH_SIZE);
      const result = await postActivities(batch);
      enviados += result.guardadas;
    }
    return { enviados };
  } catch {
    return null;
  }
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
 * consultar sin permiso pedido), o ya sincronizó hace menos de 6 h. Sube
 * métricas diarias Y entrenamientos, con la misma ventana (30 días la primera
 * vez, 7 después) y el mismo throttle — son dos fuentes independientes así
 * que una puede fallar sin tumbar la otra.
 */
export async function autoSyncHealth(): Promise<{ dias: number; entrenamientos: number } | null> {
  if (Platform.OS !== "ios") return null;
  if (!(await isHealthConnected())) return null;

  // Si el set de permisos creció, se pide lo que falte antes de consultar.
  await ensureCurrentPermissions();

  const lastSyncRaw = await AsyncStorage.getItem(LAST_SYNC_KEY).catch(() => null);
  const lastSync = lastSyncRaw ? Number(lastSyncRaw) : null;
  const now = Date.now();
  if (lastSync !== null && now - lastSync < MIN_AUTO_SYNC_INTERVAL_MS) return null;

  const days = lastSync === null ? FIRST_SYNC_DAYS : ROUTINE_SYNC_DAYS;
  const [healthResult, workoutsResult] = await Promise.all([syncHealth(days), syncWorkouts(days)]);
  if (healthResult !== null || workoutsResult !== null) {
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(now)).catch(() => {});
  }
  return { dias: healthResult?.enviados ?? 0, entrenamientos: workoutsResult?.enviados ?? 0 };
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
