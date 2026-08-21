import { z } from "zod";

/**
 * Cuestionario de onboarding (ADENDA del plan): lo mínimo que el motor
 * necesita para calcular BMR/TDEE y armar el primer menú.
 */

export const SEXES = ["FEMALE", "MALE", "OTHER"] as const;
export const GOALS = [
  "RECOMPOSICION",
  "PERDIDA_GRASA",
  "GANANCIA_MUSCULO",
  "SALUD",
  "RENDIMIENTO",
] as const;
export const WORK_SCHEDULES = ["SEDENTARIO", "ACTIVO"] as const;
export const TRAINING_TIMES = ["MANANA", "MEDIODIA", "TARDE", "NOCHE"] as const;
export const WEEK_DAYS = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"] as const;
export const DAY_SLOTS = [...TRAINING_TIMES, "DESCANSO"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
export type DaySlot = (typeof DAY_SLOTS)[number];
export type TrainingSchedule = Record<WeekDay, DaySlot>;
export const BUDGETS = ["BAJO", "MEDIO", "ALTO"] as const;

/** Condiciones que cambian las reglas del motor, no diagnósticos médicos. */
export const CONDITIONS = [
  "glucosa_alta",
  "lesion_activa",
  "hipotiroidismo",
  "sop",
  "hipertension",
  "colesterol_alto",
  "ciclo_tracking",
] as const;

export const CONDITION_LABELS: Record<(typeof CONDITIONS)[number], string> = {
  glucosa_alta: "Glucosa alta",
  lesion_activa: "Lesión activa",
  hipotiroidismo: "Hipotiroidismo",
  sop: "SOP",
  hipertension: "Presión alta",
  colesterol_alto: "Colesterol alto",
  ciclo_tracking: "Quiero registrar mi ciclo",
};

export const GOAL_LABELS: Record<(typeof GOALS)[number], string> = {
  RECOMPOSICION: "Recomposición (bajar grasa y subir músculo)",
  PERDIDA_GRASA: "Bajar grasa",
  GANANCIA_MUSCULO: "Subir músculo",
  SALUD: "Salud y hábitos",
  RENDIMIENTO: "Rendimiento",
};

/** Lista separada por comas → array limpio, sin duplicados ni vacíos. */
function commaList(max: number) {
  return z
    .string()
    .default("")
    .transform((value) =>
      Array.from(
        new Set(
          value
            .split(",")
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean),
        ),
      ).slice(0, max),
    );
}

export const onboardingSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Escribe al menos 2 caracteres")
    .max(60, "Máximo 60 caracteres"),
  sex: z.enum(SEXES, { message: "Elige una opción" }),
  birthDate: z.iso
    .date("Fecha inválida")
    .refine((iso) => {
      const year = Number(iso.slice(0, 4));
      const now = new Date().getFullYear();
      return year >= now - 100 && year <= now - 13;
    }, "La edad debe estar entre 13 y 100 años"),
  heightCm: z
    .number({ message: "Escribe tu estatura" })
    .min(120, "Mínimo 120 cm")
    .max(230, "Máximo 230 cm"),
  weightKg: z
    .number({ message: "Escribe tu peso" })
    .min(30, "Mínimo 30 kg")
    .max(300, "Máximo 300 kg"),
  leanMassKg: z.number().min(15).max(200).nullable().optional(),

  liftingDays: z
    .number({ message: "Elige cuántos días" })
    .int()
    .min(0, "Mínimo 0")
    .max(7, "Máximo 7"),
  cardioMinWk: z.number().int().min(0, "Mínimo 0").max(1500, "Máximo 1500 min").default(0),
  work: z.enum(WORK_SCHEDULES).default("SEDENTARIO"),
  trainingTime: z.enum(TRAINING_TIMES).default("MANANA"),
  /** Horario por día cuando varía; null si entrena siempre a la misma hora. */
  trainingSchedule: z
    .object({
      LUN: z.enum(DAY_SLOTS),
      MAR: z.enum(DAY_SLOTS),
      MIE: z.enum(DAY_SLOTS),
      JUE: z.enum(DAY_SLOTS),
      VIE: z.enum(DAY_SLOTS),
      SAB: z.enum(DAY_SLOTS),
      DOM: z.enum(DAY_SLOTS),
    })
    .nullable()
    .optional(),
  mealsPerDay: z
    .number({ message: "Elige cuántas comidas" })
    .int()
    .min(3, "Mínimo 3 comidas")
    .max(5, "Máximo 5 comidas"),
  budget: z.enum(BUDGETS).default("MEDIO"),

  favoriteFoods: commaList(30),
  excludedFoods: commaList(30),
  allergies: commaList(20),
  conditions: z.array(z.enum(CONDITIONS)).default([]),

  goal: z.enum(GOALS, { message: "Elige un objetivo" }),

  /**
   * Consentimiento explícito para que la IA analice las fotos de progreso.
   * Sin esto marcado, las fotos nunca salen del bucket privado.
   */
  photoConsent: z.boolean().default(false),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** Normaliza el FormData del cuestionario a los tipos del schema. */
export function coerceOnboardingPayload(raw: Record<string, unknown>): unknown {
  const num = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  };

  return {
    displayName: raw.displayName ?? "",
    sex: raw.sex,
    birthDate: raw.birthDate,
    heightCm: num(raw.heightCm),
    weightKg: num(raw.weightKg),
    leanMassKg: num(raw.leanMassKg),
    liftingDays: num(raw.liftingDays),
    cardioMinWk: num(raw.cardioMinWk) ?? 0,
    work: raw.work || "SEDENTARIO",
    trainingTime: raw.trainingTime || "MANANA",
    trainingSchedule:
      raw.scheduleVaries === "on" || raw.scheduleVaries === true
        ? Object.fromEntries(WEEK_DAYS.map((d) => [d, raw[`schedule_${d}`] || "DESCANSO"]))
        : null,
    mealsPerDay: num(raw.mealsPerDay),
    budget: raw.budget || "MEDIO",
    favoriteFoods: typeof raw.favoriteFoods === "string" ? raw.favoriteFoods : "",
    excludedFoods: typeof raw.excludedFoods === "string" ? raw.excludedFoods : "",
    allergies: typeof raw.allergies === "string" ? raw.allergies : "",
    conditions: Array.isArray(raw.conditions) ? raw.conditions : [],
    goal: raw.goal,
    photoConsent: raw.photoConsent === true || raw.photoConsent === "on",
  };
}

/**
 * Fase inicial según lo que declara el atleta. Quien viene de una pausa
 * arranca en REINTRO; quien ya trae rutina puede entrar directo a BASE.
 */
export function initialPhase(input: Pick<OnboardingInput, "liftingDays">): "REINTRO" | "BASE" {
  return input.liftingDays >= 3 ? "BASE" : "REINTRO";
}

/**
 * Si el horario varía por día, el horario "principal" es el más frecuente y
 * los días de pesas son los que no son descanso. Así el motor (que trabaja con
 * un horario y un número de días) sigue recibiendo datos coherentes.
 */
export function deriveFromSchedule(input: {
  trainingTime: (typeof TRAINING_TIMES)[number];
  liftingDays: number;
  trainingSchedule?: TrainingSchedule | null;
}): { trainingTime: (typeof TRAINING_TIMES)[number]; liftingDays: number } {
  const schedule = input.trainingSchedule;
  if (!schedule) return { trainingTime: input.trainingTime, liftingDays: input.liftingDays };
  const counts = new Map<string, number>();
  let days = 0;
  for (const slot of Object.values(schedule)) {
    if (slot === "DESCANSO") continue;
    days += 1;
    counts.set(slot, (counts.get(slot) ?? 0) + 1);
  }
  if (days === 0) return { trainingTime: input.trainingTime, liftingDays: 0 };
  const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  return { trainingTime: top as (typeof TRAINING_TIMES)[number], liftingDays: days };
}
