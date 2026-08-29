import { z } from "zod";

/**
 * Lo que manda el cliente (app o HealthKit) a `POST /api/v1/activities`.
 *
 * Registro, no prescripción: una fila es una sesión que ya pasó. `userId`
 * nunca viaja aquí — sale del Bearer en la ruta, nunca del cuerpo.
 *
 * Los topes existen para que un cliente con un bug (o HealthKit entregando
 * un dato roto) no meta una sesión de 3 días o de 900 km que después
 * envenene los promedios.
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

/** El nombre de cada disciplina en el vocabulario de la app. */
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  PESAS: "Pesas",
  FUNCIONAL: "Funcional",
  CROSSFIT: "CrossFit",
  NATACION: "Natación",
  BOX: "Box",
  SQUASH: "Squash",
  CARDIO: "Cardio",
  OTRO: "Otra",
};

export const ACTIVITY_SOURCES = ["APP", "HEALTHKIT"] as const;

/** `YYYY-MM-DD`, y que sea una fecha de verdad. Mismo patrón que `health/schema.ts`. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "la fecha va en formato YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T12:00:00.000Z`)), "fecha inexistente");

/**
 * Tope de duración: 20 horas cubre hasta un Ironman completo y se queda muy
 * por debajo de "una sesión no dura 3 días".
 */
const MAX_DURATION_MIN = 20 * 60;
/** 100 km en una sola sesión ya es un evento de ultra-resistencia real. */
const MAX_DISTANCE_M = 100_000;
/** Ni una sesión de resistencia extrema quema más que esto. */
const MAX_ACTIVE_KCAL = 5_000;
const MIN_HR = 30;
const MAX_HR = 240;

export const activitySessionSchema = z
  .object({
    discipline: z.enum(DISCIPLINES),
    source: z.enum(ACTIVITY_SOURCES),
    /** UUID del workout de HealthKit. `null`/ausente en sesiones capturadas a mano. */
    externalId: z.string().min(1).max(200).nullish(),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().nullish(),
    /** Día local de la sesión — igual que `CheckIn`/`HealthDay`, lo manda el cliente. */
    date: isoDate,
    durationMin: z.number().int().min(1).max(MAX_DURATION_MIN),
    activeKcal: z.number().int().min(0).max(MAX_ACTIVE_KCAL).nullish(),
    avgHr: z.number().int().min(MIN_HR).max(MAX_HR).nullish(),
    maxHr: z.number().int().min(MIN_HR).max(MAX_HR).nullish(),
    distanceM: z.number().int().min(0).max(MAX_DISTANCE_M).nullish(),
    notes: z.string().max(1000).nullish(),
  })
  .refine(
    (session) =>
      !session.endedAt || Date.parse(session.endedAt) >= Date.parse(session.startedAt),
    { message: "endedAt no puede ser antes de startedAt", path: ["endedAt"] },
  );

export type ActivitySessionInput = z.infer<typeof activitySessionSchema>;

/** El lote que acepta `POST /api/v1/activities`. */
export const activitiesIngestSchema = z.object({
  activities: z.array(activitySessionSchema).min(1).max(50),
});

export type ActivitiesIngestInput = z.infer<typeof activitiesIngestSchema>;
