import { supabase } from "@/lib/supabase";

/**
 * Cliente tipado de `/api/v1`. La fuente de verdad de cada contrato son los
 * routes en `apps/web/src/app/api/v1/**` — si un shape cambia allá, cambia
 * aquí el tipo correspondiente.
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error("Falta EXPO_PUBLIC_API_URL. Revisa apps/mobile/.env");
}

// ---------------------------------------------------------------------------
// Tipos de los contratos de API
// ---------------------------------------------------------------------------

export type MeResponse = {
  user: { id: string; email: string; role: string };
  onboarded: boolean;
  profile: {
    displayName: string;
    sex: "FEMALE" | "MALE" | "OTHER";
    heightCm: number | null;
    currentPhase: string;
    goal: string;
    trainingDaysPerWeek: number;
    /** Día en que cierra su semana: 0 = domingo. `null` = sin elegir. */
    checkinWeekday: number | null;
    /** Hora local del recordatorio, 0-23. `null` = sin recordatorio. */
    checkinHour: number | null;
    /** Escalón de presupuesto de despensa. */
    budget: "BAJO" | "MEDIO" | "ALTO";
    /** Cuántas comidas al día arma el motor. */
    mealsPerDay: number;
  } | null;
};

export type Decision = {
  id: string;
  phase: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  checkInDate: string;
  publishedAt: string;
  texto: string | null;
  meta: string | null;
  preguntas: string[];
  alreadyAnswered: boolean;
};

export type DecisionResponse = { decision: Decision | null };

export type CheckInDecisionSummary = {
  phase: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type CheckInRow = {
  date: string;
  waistCm: number | null;
  weightKg: number | null;
  legLeftCm: number | null;
  legRightCm: number | null;
  armLeftCm: number | null;
  armRightCm: number | null;
  decision: CheckInDecisionSummary | null;
};

export type CheckInsResponse = { checkIns: CheckInRow[] };

/** Los campos EXACTOS de `checkInSchema` (apps/web/src/lib/validation/checkin.ts). */
export const STRENGTH_TRENDS = ["SUBE", "IGUAL", "BAJA"] as const;
export const CYCLE_PHASES = ["FOLICULAR", "OVULACION", "LUTEA", "MENSTRUACION", "NA"] as const;
export const SYMPTOMS = [
  "calambres",
  "mareo",
  "dolor_espalda",
  "dolor_pie",
  "dolor_cabeza",
  "estrenimiento",
  "inflamacion_abdominal",
  "otro",
] as const;

export const SYMPTOM_LABELS: Record<(typeof SYMPTOMS)[number], string> = {
  calambres: "Calambres",
  mareo: "Mareo",
  dolor_espalda: "Dolor de espalda",
  dolor_pie: "Dolor de pie",
  dolor_cabeza: "Dolor de cabeza",
  estrenimiento: "Estreñimiento",
  inflamacion_abdominal: "Inflamación abdominal",
  otro: "Otro",
};

export type StrengthTrend = (typeof STRENGTH_TRENDS)[number];
export type CyclePhase = (typeof CYCLE_PHASES)[number];
export type Symptom = (typeof SYMPTOMS)[number];

export type CheckInPayload = {
  date: string; // yyyy-MM-dd
  waistCm: number;
  weightKg?: number | null;
  legLeftCm?: number | null;
  legRightCm?: number | null;
  armLeftCm?: number | null;
  armRightCm?: number | null;
  inflammation: number;
  energy: number;
  hunger: number;
  satiety: number;
  /**
   * Descanso 1-5. Opcional: la app ya no lo pregunta y el servidor lo deriva
   * de las noches que subió el reloj.
   */
  sleep?: number;
  strengthRpe?: number | null;
  strengthTrend?: StrengthTrend | null;
  dietCompliance: number;
  trainingCompliance: number;
  symptoms: Symptom[];
  otherSymptom?: string;
  cyclePhase?: CyclePhase | null;
  periodStarted: boolean;
  comment?: string;
};

export type CheckInCreatedResponse = { id: string; date: string };

// ---------------------------------------------------------------------------
// Fotos de progreso
// ---------------------------------------------------------------------------

/** Las tres vistas del check-in. Mismo enum que `PHOTO_VIEWS` en el servidor. */
export const PHOTO_VIEWS = ["FRENTE", "PERFIL", "ESPALDA"] as const;
export type PhotoView = (typeof PHOTO_VIEWS)[number];

export const PHOTO_VIEW_LABEL: Record<PhotoView, string> = {
  FRENTE: "Frente",
  PERFIL: "Perfil",
  ESPALDA: "Espalda",
};

/** Bucket privado de las fotos. La RLS filtra por primera carpeta = user id. */
export const PHOTO_BUCKET = "progress-photos";

/**
 * Ruta canónica de una foto de progreso — la MISMA que reconstruye el
 * servidor (`photoPath` en apps/web/src/lib/storage.ts). Si las dos fórmulas
 * se separan, la app sube a un lado y el servidor registra otro.
 */
export function progressPhotoPath(userId: string, checkInId: string, view: PhotoView): string {
  return `${userId}/${checkInId}/${view.toLowerCase()}.jpg`;
}

/** Confirma al servidor que la foto ya quedó en Storage y crea su fila. */
export function postCheckinPhoto(
  checkInId: string,
  view: PhotoView,
): Promise<{ id: string; view: PhotoView }> {
  return apiFetch<{ id: string; view: PhotoView }>(`/api/v1/checkins/${checkInId}/photos`, {
    method: "POST",
    body: { view },
  });
}

export type ProgressPhoto = {
  id: string;
  checkInId: string;
  /** yyyy-MM-dd del check-in al que pertenece. */
  date: string;
  view: PhotoView;
  /** URL firmada y temporal. `null` si la firma falló. */
  url: string | null;
};

/** `GET /api/v1/photos` — para la bóveda. Las URLs caducan. */
export function getPhotos(limit?: number): Promise<{ fotos: ProgressPhoto[] }> {
  const query = limit ? `?limit=${limit}` : "";
  return apiFetch<{ fotos: ProgressPhoto[] }>(`/api/v1/photos${query}`);
}

export type MenuItem = { name: string; grams: number; free: boolean };
export type MenuMeal = {
  slot: string;
  label: string;
  timeHint: string;
  allowDenseCarb: boolean;
  items: MenuItem[];
  equivalences: Array<{ forName: string; options: Array<{ name: string; grams: number }> }>;
};
export type Menu = { menuNumber: number; meals: MenuMeal[] };
export type GroceryItem = { name: string; grams: number; unit: string };

export type NutritionDecisionSummary = {
  id: string;
  phase: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type NutritionResponse = {
  decision: NutritionDecisionSummary | null;
  menus: Menu[];
  groceries: GroceryItem[];
  materialized: boolean;
};

export type TodayCard = {
  workoutId: string;
  muscleGroup: string;
  schemeLabel: string;
  exerciseCount: number;
  cardioMinutes: number | null;
  completed: boolean;
  /** Minutos a los que se recortó la sesión, o `null` si está completa. */
  trimmedMinutes: number | null;
};

export type TrainingTodayResponse = { today: TodayCard | null };

/** Lo que regresa `POST /api/v1/training/trim`. */
export type TrimResponse = {
  sesion: {
    workoutId: string;
    date: string;
    muscleGroup: string;
    minutes: number;
    exercises: number;
    removed: number;
  };
};

/**
 * "Hoy tengo menos tiempo": vuelve a armar la sesión para los minutos que hay.
 *
 * `minutes: null` deshace el recorte y la deja como estaba. El servidor
 * rechaza con 409 una sesión que ya tiene series capturadas — recortarla
 * dejaría esas series apuntando a un plan que ya no existe.
 */
export function trimSession(workoutId: string, minutes: number | null): Promise<TrimResponse> {
  return apiFetch<TrimResponse>("/api/v1/training/trim", {
    method: "POST",
    body: { workoutId, minutes },
  });
}

export type CheckInPoint = {
  id: string;
  date: string;
  waistCm: number | null;
  weightKg: number | null;
  legLeftCm: number | null;
  legRightCm: number | null;
  armLeftCm: number | null;
  armRightCm: number | null;
  inflammation: number;
  energy: number;
  dietCompliance: number;
  phase: string | null;
};

export type HistoryMeasurementsResponse = { points: CheckInPoint[] };

// ---------------------------------------------------------------------------
// Modo gimnasio (Fase N4) — contrato EXACTO de
// apps/web/src/lib/training/view.ts y apps/web/src/lib/validation/training.ts.
// Si esos shapes cambian allá, cambian aquí.
// ---------------------------------------------------------------------------

export type SchemeId =
  | "PIRAMIDAL"
  | "FUERZA"
  | "METABOLICO"
  | "RANGO_MEDIO"
  | "VOLUMEN_9"
  | "REHAB";

/** Una serie objetivo: reps y el peso sugerido. `weightKg: null` = campo vacío. */
export type TargetSet = {
  reps: number;
  weightKg: number | null;
  warmup: boolean;
};

/** A qué se puede cambiar un ejercicio si la máquina está ocupada. */
export type ExerciseAlternative = {
  exerciseId: string;
  name: string;
  declared: boolean;
  videoPath: string | null;
};

export type SessionExerciseView = {
  exerciseId: string | null;
  name: string;
  muscleGroup: string;
  poolRole: string;
  scheme: SchemeId;
  schemeLabel: string;
  restSeconds: number;
  videoPath: string | null;
  tracker: boolean;
  note: string | null;
  sets: TargetSet[];
  /** URL firmada del video. Caduca; sin red la pantalla se pinta igual. */
  videoUrl: string | null;
  lastWeightKg: number | null;
  bestWeightKg: number | null;
  record: PersonalRecord | null;
  alternatives: ExerciseAlternative[];
};

export type SessionView = {
  workoutId: string;
  date: string;
  muscleGroup: string;
  scheme: SchemeId;
  schemeLabel: string;
  cardioMinutes: number | null;
  completedAt: string | null;
  /** Minutos a los que se recortó la sesión, o `null` si está completa. */
  trimmedMinutes: number | null;
  cycleNote: string | null;
  readinessNote: string | null;
  exercises: SessionExerciseView[];
};

export type WeekView = {
  weekStart: string;
  today: string;
  sessions: SessionView[];
};

/**
 * Una serie capturada, lista para subir. Shape exacto de `workoutSetSchema`
 * en apps/web/src/lib/validation/training.ts.
 *
 * `clientId` sigue la convención de la web (apps/web/src/app/app/entrenamiento
 * /training-session.tsx): `${workoutId}:${exerciseIndex}:${setIndex}`. Es
 * contrato con el servidor — el borrado selectivo al sustituir ejercicio hace
 * `deleteMany` por prefijo `${workoutId}:${exerciseIndex}:`.
 */
export type WorkoutSetInput = {
  clientId: string;
  exerciseId: string | null;
  exerciseName: string;
  setIndex: number;
  targetReps: number;
  reps: number;
  weightKg: number | null;
  rpe: number | null;
  warmup: boolean;
  performedAt: string;
};

export type SubstitutionInput = { exerciseIndex: number; exerciseId: string };

/** Una sesión pendiente de subir. Shape exacto de `sessionSyncSchema`. */
export type SessionSyncInput = {
  workoutId: string;
  completedAt: string | null;
  notes: string | null;
  sets: WorkoutSetInput[];
  substitutions: SubstitutionInput[];
};

export type SyncSessionResult =
  | {
      workoutId: string;
      ok: true;
      prs: Array<{ exerciseName: string; weightKg: number; previousKg: number | null }>;
      volumeKg: number;
      cambios: unknown;
    }
  | { workoutId: string; ok: false; error: string };

export type SyncResponse = { resultados: SyncSessionResult[] };

export type TrainingHistoryRow = {
  workoutId: string;
  date: string;
  muscleGroup: string;
  volumeKg: number;
  sets: number;
  prs: Array<{ exerciseName: string; weightKg: number }>;
  completed: boolean;
};

export type PersonalRecord = {
  exerciseName: string;
  weightKg: number;
  reps: number;
  date: string;
};

export type HistoryTrainingResponse = {
  sessions: TrainingHistoryRow[];
  records: PersonalRecord[];
};

export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
};

export type NotificationsResponse = { notificaciones: Notification[] };
export type MarkNotificationsReadResponse = { marcadas: number };

// ---------------------------------------------------------------------------
// Fetch base
// ---------------------------------------------------------------------------

/** Error de API con el status HTTP y, si vino, el cuerpo de error del backend. */
export class ApiError extends Error {
  status: number;
  detalles?: Record<string, string>;

  constructor(message: string, status: number, detalles?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detalles = detalles;
  }
}

/**
 * `fetch` autenticado contra `/api/v1`: toma el access token de la sesión de
 * Supabase, agrega el Bearer, y si el backend responde 401 (sesión muerta)
 * cierra la sesión local para forzar el regreso a /login.
 */
async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401) {
    // Sesión muerta o inválida en el backend: no tiene caso conservarla local.
    await supabase.auth.signOut();
    throw new ApiError("Tu sesión expiró. Vuelve a iniciar sesión.", 401);
  }

  if (!response.ok) {
    let message = `Error del servidor (${response.status})`;
    let detalles: Record<string, string> | undefined;
    try {
      const body = (await response.json()) as { error?: string; detalles?: Record<string, string> };
      if (body.error) message = body.error;
      detalles = body.detalles;
    } catch {
      // El cuerpo no era JSON: nos quedamos con el mensaje genérico.
    }
    throw new ApiError(message, response.status, detalles);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/v1/me");
}

/** `PATCH /api/v1/me/checkin` — cuándo cierra su semana esta persona. */
export function patchCheckinSchedule(
  weekday: number | null,
  hour: number | null,
): Promise<{ checkinWeekday: number | null; checkinHour: number | null }> {
  return apiFetch<{ checkinWeekday: number | null; checkinHour: number | null }>(
    "/api/v1/me/checkin",
    { method: "PATCH", body: { weekday, hour } },
  );
}

/** `PATCH /api/v1/me/nutricion` — hoy solo el presupuesto de despensa. */
export function patchPresupuesto(
  budget: "BAJO" | "MEDIO" | "ALTO",
): Promise<{ budget: "BAJO" | "MEDIO" | "ALTO" }> {
  return apiFetch<{ budget: "BAJO" | "MEDIO" | "ALTO" }>("/api/v1/me/nutricion", {
    method: "PATCH",
    body: { budget },
  });
}

export function getDecision(): Promise<DecisionResponse> {
  return apiFetch<DecisionResponse>("/api/v1/decision");
}

export function getCheckins(limit?: number): Promise<CheckInsResponse> {
  const query = limit ? `?limit=${limit}` : "";
  return apiFetch<CheckInsResponse>(`/api/v1/checkins${query}`);
}

export function postCheckin(payload: CheckInPayload): Promise<CheckInCreatedResponse> {
  return apiFetch<CheckInCreatedResponse>("/api/v1/checkins", { method: "POST", body: payload });
}

export function getNutrition(): Promise<NutritionResponse> {
  return apiFetch<NutritionResponse>("/api/v1/nutrition");
}

export function getTrainingToday(): Promise<TrainingTodayResponse> {
  return apiFetch<TrainingTodayResponse>("/api/v1/training/today");
}

/** `GET /api/v1/training/week` — la semana entera para el modo gimnasio offline. */
export function getTrainingWeek(date?: string): Promise<WeekView> {
  const query = date ? `?date=${date}` : "";
  return apiFetch<WeekView>(`/api/v1/training/week${query}`);
}

/** `POST /api/v1/training/sync` — vacía la cola local: hasta 20 sesiones de golpe. */
export function postTrainingSync(sessions: SessionSyncInput[]): Promise<SyncResponse> {
  return apiFetch<SyncResponse>("/api/v1/training/sync", { method: "POST", body: { sessions } });
}

export function getHistoryMeasurements(): Promise<HistoryMeasurementsResponse> {
  return apiFetch<HistoryMeasurementsResponse>("/api/v1/history/measurements");
}

export function getHistoryTraining(): Promise<HistoryTrainingResponse> {
  return apiFetch<HistoryTrainingResponse>("/api/v1/history/training");
}

export function getNotifications(): Promise<NotificationsResponse> {
  return apiFetch<NotificationsResponse>("/api/v1/notifications");
}

export function markNotificationsRead(ids: string[]): Promise<MarkNotificationsReadResponse> {
  return apiFetch<MarkNotificationsReadResponse>("/api/v1/notifications/read", {
    method: "POST",
    body: { ids },
  });
}

// ---------------------------------------------------------------------------
// Objetivo — "Rumbo a tu objetivo" (contrato EXACTO de
// apps/web/src/lib/coachy/goal.ts y apps/web/src/app/api/v1/goal/**).
// ---------------------------------------------------------------------------

export const GOAL_VIEWS = ["FRENTE", "PERFIL", "ESPALDA"] as const;
export type GoalView = (typeof GOAL_VIEWS)[number];

export const GOAL_VIEW_LABEL: Record<GoalView, string> = {
  FRENTE: "Frente",
  PERFIL: "Perfil",
  ESPALDA: "Espalda",
};

/** `goalPhotoPath` en apps/web/src/lib/coachy/goal.ts: la vista va en minúsculas
 * en el nombre del archivo, aunque el enum viaje en mayúsculas por la API. */
export function goalPhotoPath(userId: string, view: GoalView): string {
  return `${userId}/goal/${view.toLowerCase()}.jpg`;
}

/** El mismo `GoalStatus` de apps/web/src/lib/coachy/goal.ts — el texto de
 * "listo" ya llega renderizado en `lines`, no hay que armar frases aquí. */
/** Zonas del análisis de objetivo. Mismo enum que el servidor. */
export const GOAL_ZONES = ["cintura", "cadera_gluteo", "pierna", "brazo", "espalda"] as const;
export type GoalZone = (typeof GOAL_ZONES)[number];

export const GOAL_ZONE_LABEL: Record<GoalZone, string> = {
  cintura: "Cintura",
  cadera_gluteo: "Glúteo",
  pierna: "Pierna",
  brazo: "Brazo",
  espalda: "Espalda",
};

/** Qué tan lejos está esa zona de la referencia. */
export type GoalGap = "cerca" | "media" | "lejos";
/** Hacia dónde se movió respecto de la quincena anterior. */
export type GoalTrend = "acercándose" | "igual" | "alejándose";
/** Cuánto énfasis de entrenamiento implica la referencia en esa zona. */
export type GoalEmphasis = "alto" | "medio" | "bajo";

export type GoalZoneReading = {
  zona: GoalZone;
  brecha: GoalGap;
  tendencia: GoalTrend;
  accion: string;
};

export type GoalDirectionReading = { zona: GoalZone; enfasis: GoalEmphasis };

export type GoalStatus =
  | { state: "sin_referencia" }
  /**
   * Hay referencia pero todavía no fotos propias con qué comparar. `lines`
   * trae la lectura de la referencia sola: dónde poner el énfasis. Puede
   * llegar vacío si la visión está apagada.
   */
  | {
      state: "sin_fotos";
      references: number;
      lines: string[];
      /** Lo mismo que `lines`, estructurado, para graficar el énfasis. */
      emphasis: GoalDirectionReading[];
    }
  | { state: "en_espera"; references: number }
  | {
      state: "listo";
      references: number;
      lines: string[];
      /** Lo mismo que `lines`, estructurado, para dibujar la brecha por zona. */
      readings: GoalZoneReading[];
      analyzedAt: string;
    };

export type GoalReferenceUrl = { view: GoalView; url: string };

export type GoalResponse = { status: GoalStatus; references: GoalReferenceUrl[] };

export function getGoal(): Promise<GoalResponse> {
  return apiFetch<GoalResponse>("/api/v1/goal");
}

/** Confirma que la foto de `view` ya está en Storage (subida directa desde el
 * teléfono). 422 si Storage no la tiene todavía. */
export function postGoalReference(view: GoalView): Promise<{ view: GoalView; path: string }> {
  return apiFetch<{ view: GoalView; path: string }>("/api/v1/goal/references", {
    method: "POST",
    body: { view },
  });
}

export function deleteGoalReference(view: GoalView): Promise<{ view: GoalView; eliminada: boolean }> {
  return apiFetch<{ view: GoalView; eliminada: boolean }>(
    `/api/v1/goal/references?view=${view}`,
    { method: "DELETE" },
  );
}

// ---------------------------------------------------------------------------
// Salud del reloj (Fase N5) — contrato EXACTO de
// apps/web/src/lib/health/schema.ts (`healthDaySchema` / `healthIngestSchema`).
// Todo menos `date` es opcional y nullable: un campo ausente no borra el que
// ya estaba guardado en el servidor.
// ---------------------------------------------------------------------------

export type HealthDayPayload = {
  /** yyyy-MM-dd */
  date: string;
  steps?: number | null;
  activeKcal?: number | null;
  exerciseMin?: number | null;
  sleepMin?: number | null;
  restingHr?: number | null;
  /** Variabilidad cardiaca (SDNN, ms): el proxy de recuperación. */
  hrvMs?: number | null;
  /** VO₂ máx estimado por el reloj (mL/kg/min). */
  vo2max?: number | null;
  /** Respiraciones por minuto en reposo. */
  respiratoryRate?: number | null;
  /** Saturación de oxígeno (%). Se guarda y grafica; nunca se interpreta. */
  spo2?: number | null;
  /** Horas del día con al menos un minuto de pie (anillo azul de Apple). */
  standHours?: number | null;
};

export type HealthDaysResponse = { dias: HealthDayPayload[] };

export type PostHealthDaysResponse = { ok: true; guardados: number; fechas: string[] };

/** `GET /api/v1/health` — los últimos 7 días guardados, del más reciente al más viejo. */
export function getHealthDays(): Promise<HealthDaysResponse> {
  return apiFetch<HealthDaysResponse>("/api/v1/health");
}

/** `POST /api/v1/health` — un día o un lote (hasta 60, tope de `healthIngestSchema`). */
export function postHealthDays(days: HealthDayPayload[]): Promise<PostHealthDaysResponse> {
  return apiFetch<PostHealthDaysResponse>("/api/v1/health", { method: "POST", body: { days } });
}

// ---------------------------------------------------------------------------
// Actividades del reloj (Fase N6) — contrato EXACTO de `POST/GET
// /api/v1/activities`. Topes del validador (para descartar en el cliente
// ANTES de mandar, así un workout fuera de rango no tumba el lote entero):
// durationMin 1–1200, activeKcal 0–5000, avgHr/maxHr 30–240, distanceM
// 0–100000, notes ≤1000 caracteres. Máx 50 actividades por lote.
// ---------------------------------------------------------------------------

export const DISCIPLINES = [
  "PESAS",
  "FUNCIONAL",
  "CROSSFIT",
  "NATACION",
  "BOX",
  "SQUASH",
  "CARDIO",
  "OTRO",
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  PESAS: "Pesas",
  FUNCIONAL: "Funcional",
  CROSSFIT: "Crossfit",
  NATACION: "Natación",
  BOX: "Box",
  SQUASH: "Squash",
  CARDIO: "Cardio",
  OTRO: "Otro",
};

export const ACTIVITY_SOURCES = ["APP", "HEALTHKIT"] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export type ActivityPayload = {
  discipline: Discipline;
  source: ActivitySource;
  /**
   * uuid del workout en HealthKit — POST es idempotente por este campo.
   *
   * Va en `null` cuando la sesión se capturó a mano en la app: no hay nada
   * externo con qué des-duplicarla, y el servidor la trata como fila nueva
   * (ver `saveActivities` en apps/web/src/lib/activity/db.ts).
   */
  externalId: string | null;
  startedAt: string; // ISO
  endedAt: string; // ISO
  /** yyyy-MM-dd en zona LOCAL del teléfono, calculada a partir de `startedAt`. */
  date: string;
  durationMin: number;
  activeKcal?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  distanceM?: number | null;
  notes?: string | null;
};

export type Activity = ActivityPayload & { id: string };

export type ActivitiesResponse = { actividades: Activity[] };
export type PostActivitiesResponse = { ok: true; guardadas: number };

/** `GET /api/v1/activities?limit=` — orden `startedAt` desc. */
export function getActivities(limit?: number): Promise<ActivitiesResponse> {
  const query = limit ? `?limit=${limit}` : "";
  return apiFetch<ActivitiesResponse>(`/api/v1/activities${query}`);
}

/** `POST /api/v1/activities` — hasta 50 por lote. Idempotente por `externalId`. */
export function postActivities(activities: ActivityPayload[]): Promise<PostActivitiesResponse> {
  return apiFetch<PostActivitiesResponse>("/api/v1/activities", { method: "POST", body: { activities } });
}

/** Lo que la pantalla de captura manual le pide a quien entrenó: qué, cuánto y cuándo. */
export type ManualActivityInput = {
  discipline: Discipline;
  durationMin: number;
  /** yyyy-MM-dd en zona local del teléfono. */
  date: string;
  notes?: string | null;
};

/**
 * Registra a mano una sesión que el reloj no vio (o que se hizo sin reloj).
 *
 * `startedAt` se ancla al mediodía del día elegido: la hora exacta no se
 * pregunta — pedirla por un dato que nadie consulta es fricción — y el
 * mediodía evita que la sesión se cruce de día en cualquier zona horaria.
 */
export function postManualActivity(input: ManualActivityInput): Promise<PostActivitiesResponse> {
  const startedAt = new Date(`${input.date}T12:00:00.000Z`);
  const endedAt = new Date(startedAt.getTime() + input.durationMin * 60_000);

  return postActivities([
    {
      discipline: input.discipline,
      source: "APP",
      externalId: null,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      date: input.date,
      durationMin: input.durationMin,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    },
  ]);
}
