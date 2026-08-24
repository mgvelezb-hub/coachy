import { z } from "zod";

/**
 * Lo que el modo gimnasio manda al servidor cuando vuelve la red.
 *
 * Cada serie trae su `clientId`: el teléfono lo genera al capturarla y es lo
 * que hace idempotente la cola offline. Reintentar la misma sesión veinte veces
 * escribe exactamente las mismas filas.
 */
export const workoutSetSchema = z.object({
  clientId: z.string().min(8).max(64),
  exerciseId: z.uuid().nullable(),
  exerciseName: z.string().min(1).max(120),
  setIndex: z.number().int().min(0).max(50),
  targetReps: z.number().int().min(0).max(100),
  reps: z.number().int().min(0).max(100),
  weightKg: z.number().min(0).max(600).nullable(),
  rpe: z.number().int().min(1).max(10).nullable(),
  warmup: z.boolean().default(false),
  performedAt: z.iso.datetime(),
});

/**
 * Un cambio de ejercicio hecho en el gimnasio.
 *
 * Viaja con la sesión y no aparte: el cambio pasa sin señal, se aplica primero
 * en el teléfono y llega aquí cuando vuelve la red. El servidor revisa que el
 * ejercicio elegido sea equivalente antes de tocar el plan.
 */
export const substitutionSchema = z.object({
  exerciseIndex: z.number().int().min(0).max(30),
  exerciseId: z.uuid(),
});

export const sessionSyncSchema = z.object({
  workoutId: z.uuid(),
  completedAt: z.iso.datetime().nullable(),
  notes: z.string().max(1000).nullable().default(null),
  sets: z.array(workoutSetSchema).max(200),
  substitutions: z.array(substitutionSchema).max(20).default([]),
});

export type WorkoutSetInput = z.infer<typeof workoutSetSchema>;
export type SessionSyncInput = z.infer<typeof sessionSyncSchema>;

/** Varias sesiones de golpe: la cola sube todo lo que quedó pendiente. */
export const syncBatchSchema = z.object({
  sessions: z.array(sessionSyncSchema).min(1).max(20),
});
