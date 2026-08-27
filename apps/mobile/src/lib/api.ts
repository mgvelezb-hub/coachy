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
    heightCm: number | null;
    currentPhase: string;
    goal: string;
    trainingDaysPerWeek: number;
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
  sleep: number;
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
};

export type TrainingTodayResponse = { today: TodayCard | null };

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
