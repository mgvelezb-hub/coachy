/**
 * Tipos del generador de rutina semanal (Fase 4).
 *
 * Todo aquí es puro: no toca Prisma ni el reloj. `generateWeek` recibe la fecha
 * de inicio de semana como dato, de modo que la misma entrada siempre produce
 * la misma rutina y se puede probar sin base ni red.
 */

/** Grupos tal como viven en la tabla `exercises`. */
export const MUSCLE_GROUPS = [
  "PIERNA",
  "HOMBRO",
  "PECHO",
  "ESPALDA",
  "BICEP",
  "TRICEP",
  "ABDOMEN",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/** Tipo de sesión del split del coach. */
export type DayKind =
  | "PIERNA_CUADRICEPS"
  | "PIERNA_FEMORAL"
  | "PIERNA_GLUTEO"
  | "HOMBRO"
  | "PECHO_ESPALDA"
  | "BRAZO"
  | "HOMBRO_BRAZO"
  | "TORSO";

/** Esquemas sello del coach. Rotan por semana ISO. */
export type SchemeId =
  | "PIRAMIDAL"
  | "FUERZA"
  | "METABOLICO"
  | "RANGO_MEDIO"
  | "VOLUMEN_9"
  | "REHAB";

export type Scheme = {
  id: SchemeId;
  /** Etiqueta que ve la atleta, con el vocabulario del coach. */
  label: string;
  /** Reps objetivo por serie, en orden. */
  reps: number[];
  /** Descanso entre series, en segundos. */
  restSeconds: number;
  /** El peso sube serie a serie (piramidal, metabólico, rango medio). */
  ramping: boolean;
};

/** Un ejercicio del catálogo, aplanado a lo que el generador necesita. */
export type ExerciseOption = {
  id: string;
  name: string;
  muscleGroup: string;
  poolRole: string;
  videoUrl: string | null;
  isTracker: boolean;
  substitutes: string[];
};

/** Una serie objetivo: reps y el peso que sugerimos, si hay con qué. */
export type TargetSet = {
  reps: number;
  /** kg sugeridos. `null` = campo vacío, la atleta escribe el suyo. */
  weightKg: number | null;
  /** Serie de calentamiento: no cuenta para progresión ni para volumen objetivo. */
  warmup: boolean;
};

export type PlannedExercise = {
  exerciseId: string | null;
  name: string;
  muscleGroup: string;
  poolRole: string;
  scheme: SchemeId;
  schemeLabel: string;
  restSeconds: number;
  /** Ruta del video en Storage (o URL). `null` si el banco no lo tiene aún. */
  videoPath: string | null;
  /** Ejercicio trazador: se registra carga cada semana. */
  tracker: boolean;
  /** Nota del coach para este ejercicio (calentamiento, protocolo de lesión). */
  note: string | null;
  sets: TargetSet[];
};

export type PlannedWorkout = {
  /** Fecha del día, ISO `YYYY-MM-DD`. */
  date: string;
  dayKind: DayKind;
  /** Etiqueta legible: "Pierna · cuádriceps". */
  muscleGroup: string;
  /** Esquema dominante de la sesión. */
  scheme: SchemeId;
  schemeLabel: string;
  /** Minutos de cardio sugeridos; `null` si toca suspenderlo. */
  cardioMinutes: number | null;
  exercises: PlannedExercise[];
};

export type GeneratedWeek = {
  /** Lunes de la semana, ISO `YYYY-MM-DD`. */
  weekStart: string;
  isoWeek: number;
  scheme: SchemeId;
  workouts: PlannedWorkout[];
};

/** Lo que el generador necesita saber de la atleta. */
export type TrainingProfile = {
  liftingDays: number;
  /** `{LUN..DOM: MANANA|MEDIODIA|TARDE|NOCHE|DESCANSO}` o null. */
  trainingSchedule: Record<string, string> | null;
  /** Etiquetas libres del perfil: `lesion_activa`, `lesion_rodilla`, ... */
  conditions: string[];
  /** Fase de la dieta: en déficit fuerte se recorta volumen. */
  phase: string;
  /** Minutos por sesión. 45 ⇒ 4-5 ejercicios; 60+ ⇒ 6-8. */
  sessionMinutes: number;
  cardioMinWk: number;
};

/** Una serie ya ejecutada, tal como la devuelve el historial. */
export type HistorySet = {
  exerciseId: string | null;
  exerciseName: string;
  setIndex: number;
  targetReps: number;
  reps: number;
  weightKg: number | null;
  rpe: number | null;
  warmup: boolean;
};

/** Una sesión pasada: lo que se planeó y lo que se ejecutó. */
export type HistoryWorkout = {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  exerciseNames: string[];
  sets: HistorySet[];
};

export type GenerateWeekConfig = {
  /** Lunes de la semana a generar. El generador nunca lee el reloj. */
  weekStart: Date;
  catalog: ExerciseOption[];
};
