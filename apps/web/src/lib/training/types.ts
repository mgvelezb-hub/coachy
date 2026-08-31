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

/**
 * Cuánto volumen mete el generador en la sesión. Concepto propio del
 * entrenamiento — no una fase de dieta (`Phase` en `prisma/schema.prisma`
 * es del motor de nutrición y este módulo no lo conoce). `db.ts` es el único
 * lugar que traduce la fase de la atleta a este valor; ver el comentario ahí.
 */
export type VolumeBias = "normal" | "reducido";

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
  /** `PRINCIPIANTE` | `INTERMEDIO` | `AVANZADO`. */
  level: string;
  /** `BARRA` | `MANCUERNA` | `MAQUINA` | `POLEA` | `PESO_CORPORAL`. */
  equipment: string;
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
  /**
   * Sesiones de las otras disciplinas activas, ya repartidas en la semana.
   * No se guardan como `Workout`: son sugerencias de día con su plan, y el
   * registro de lo que pase vive en `ActivitySession`.
   */
  otherSessions: OtherSessionPlan[];
};

/**
 * Una sesión de otra disciplina, tal como sale del planificador. El tipo
 * completo vive en `disciplines.ts`; aquí se declara estructural para que
 * `types.ts` siga sin importar nada.
 */
export type OtherSessionPlan = {
  date: string;
  weekday: string;
  discipline: Discipline;
  minutes: number;
  sesion: unknown | null;
  note: string;
  sharesDayWithGym: boolean;
  /** `1` si es la única sesión del día (o la primera de un combo); `2` si es el segundo bloque. */
  orden: 1 | 2;
};

/**
 * Disciplinas que el registro conoce. Igual que `Discipline` en el schema,
 * repetido aquí porque este módulo es puro y no importa Prisma.
 */
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

/**
 * Para qué sirve esta disciplina en la semana de la persona. Mismos valores
 * que `Proposito` en `replan.ts` (repetido aquí porque `types.ts` es puro y no
 * importa ese módulo, igual que `Discipline`): `ENTRENAMIENTO` pide sesiones
 * completas, `HOBBY` un hueco. Ver `PESO_POR_PROPOSITO` en `replan.ts`.
 */
export type Proposito = "ENTRENAMIENTO" | "COMPLEMENTO" | "HOBBY";

/**
 * Una disciplina secundaria y cuántas veces por semana se practica.
 *
 * `proposito` e `importancia` (1-3) son lo que la persona contestó al
 * replanificar — antes se preguntaban en la pantalla de rearmar rutina y se
 * tiraban, así que la pantalla de recalibrar tenía que adivinar la
 * importancia contando sesiones. Opcionales porque las cargas viejas (de
 * antes de esta fase) no los traen: `parseDisciplineLoads` las sigue
 * aceptando sin ellos.
 */
export type DisciplineLoad = {
  discipline: Discipline;
  sessionsPerWeek: number;
  proposito?: Proposito;
  /** 1 a 3. Fuera de rango se descarta el campo, no la entrada entera. */
  importancia?: number;
};

/** Nivel en el agua. Igual que `SwimLevel` en el schema. */
export const SWIM_LEVELS = ["PRINCIPIANTE", "INTERMEDIO", "AVANZADO"] as const;
export type SwimLevel = (typeof SWIM_LEVELS)[number];

/** Lo que el generador necesita saber de la atleta. */
export type TrainingProfile = {
  /**
   * Presupuesto semanal de sesiones de entrenamiento. Se llama `liftingDays`
   * por historia: cuando solo había pesas, las sesiones y los días de pesas
   * eran lo mismo. Con otras disciplinas activas ya no lo son — ver
   * `liftingDaysWithinBudget`.
   */
  liftingDays: number;
  /** `{LUN..DOM: MANANA|MEDIODIA|TARDE|NOCHE|DESCANSO}` o null. */
  trainingSchedule: Record<string, string> | null;
  /** Etiquetas libres del perfil: `lesion_activa`, `lesion_rodilla`, ... */
  conditions: string[];
  /** "reducido" recorta un ejercicio por sesión. Ver `VolumeBias`. */
  volumeBias: VolumeBias;
  /** Minutos por sesión. 45 ⇒ 4-5 ejercicios; 60+ ⇒ 6-8. */
  sessionMinutes: number;
  cardioMinWk: number;
  /**
   * Grupos que esta persona pidió no repetir en la semana. Se entrenan una
   * vez y las repeticiones se reemplazan por trabajo del resto del cuerpo.
   */
  avoidRepeatGroups: MuscleGroup[];
  /** La disciplina que arma el esqueleto de la semana. */
  primaryDiscipline: Discipline;
  /** Las demás disciplinas activas, con su carga semanal. */
  otherDisciplines: DisciplineLoad[];
  /** Nivel declarado por disciplina. Lo que falte arranca en principiante. */
  disciplineLevels: Partial<Record<Discipline, SwimLevel>>;
  /** Nivel en el gimnasio: acota qué ejercicios puede elegir el generador. */
  gymLevel: SwimLevel;
  /** El objetivo del perfil: modula el volumen de las otras disciplinas. */
  goal: string;
  /**
   * Minutos disponibles por día, tal como la persona los declaró al
   * replanificar. `null` = no se ha declarado; el planificador usa sus
   * defaults (`DEFAULT_MINUTES` en `disciplines.ts`). Con dato real, un
   * combo se acepta o se rechaza contra el tiempo de verdad del día, no
   * contra 60 minutos imaginarios.
   */
  timePerDay: Partial<Record<WeekDay, number>> | null;
  /**
   * Si el planificador debe combinar disciplinas compatibles el mismo día
   * (`true`, el default en la base) o darle a cada una su propio día
   * (`false`). Ver el docblock de `compactDays` en `schema.prisma` para el
   * porqué del default.
   */
  compactDays: boolean;
};

/**
 * Día de la semana, igual que `WeekDay` en `split.ts` (repetido aquí porque
 * `types.ts` es puro y no importa ese módulo).
 */
export type WeekDay = "LUN" | "MAR" | "MIE" | "JUE" | "VIE" | "SAB" | "DOM";

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
  /**
   * Grupos con prioridad esta semana, del análisis contra la referencia del
   * objetivo. Cada día que los toque lleva un ejercicio extra — y nada más:
   * el énfasis no cambia el split, los días ni las cargas.
   */
  emphasis?: MuscleGroup[];
};
