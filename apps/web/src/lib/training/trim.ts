import "server-only";

import type { Prisma, Profile, Workout } from "@prisma/client";

import { isoFromDateColumn } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { generateWeek, mondayOf } from "@/lib/training/generate";
import {
  loadCatalog,
  loadHistory,
  parseStoredPlan,
  toTrainingProfile,
} from "@/lib/training/db";

/**
 * "Hoy tengo menos tiempo": la sesión de un día se vuelve a armar para los
 * minutos que de verdad hay.
 *
 * No inventa nada nuevo. El generador ya decide cuántos ejercicios caben según
 * los minutos de sesión y ya sabe qué soltar primero —los huecos de prioridad
 * más baja, que son los accesorios— así que recortar es correr el mismo
 * generador con otro número de minutos y quedarse con el día que toca. Lo
 * compuesto se queda, el aislado se va: exactamente el orden que uno seguiría
 * con prisa.
 *
 * Dos reglas que la hacen segura:
 *
 * 1. **No se recorta una sesión empezada.** Si ya hay series capturadas o la
 *    sesión está cerrada, cambiarle los ejercicios dejaría series huérfanas
 *    apuntando a un plan que ya no existe.
 * 2. **Queda marcada.** `trimmedMinutes` guarda a cuántos minutos se recortó,
 *    para que la retro del check-in pueda decir "entrenaste, con menos tiempo"
 *    en vez de contarlo como sesión incompleta. Tres semanas recortando los
 *    mismos días no es falta de disciplina: es que el horario declarado no es
 *    el horario real, y la respuesta correcta es mover el día.
 */

export class SessionNotFoundError extends Error {
  constructor() {
    super("No existe esa sesión.");
    this.name = "SessionNotFoundError";
  }
}

export class SessionAlreadyStartedError extends Error {
  constructor() {
    super("Esa sesión ya tiene series registradas: no se puede recortar a media sesión.");
    this.name = "SessionAlreadyStartedError";
  }
}

/** Piso y techo de lo que tiene sentido pedir. */
export const MIN_TRIM_MINUTES = 10;
export const MAX_TRIM_MINUTES = 180;

export type TrimResult = {
  workoutId: string;
  date: string;
  muscleGroup: string;
  minutes: number;
  /** Cuántos ejercicios quedaron y cuántos había antes. */
  exercises: number;
  removed: number;
};

export async function trimSession(
  userId: string,
  profile: Profile,
  workoutId: string,
  minutes: number,
): Promise<TrimResult> {
  const workout = await prisma.workout.findFirst({
    where: { id: workoutId, userId },
    include: { _count: { select: { sets: true } } },
  });
  if (!workout) throw new SessionNotFoundError();
  if (workout.completedAt !== null || workout._count.sets > 0) {
    throw new SessionAlreadyStartedError();
  }

  const anterior = parseStoredPlan(workout.exercisesJson);
  const date = isoFromDateColumn(workout.date);
  const monday = mondayOf(workout.date);

  const [catalog, history] = await Promise.all([loadCatalog(), loadHistory(userId, monday)]);

  // El mismo perfil, con los minutos de hoy. El resto —días, split, esquema de
  // la semana— no se toca: recortar el tiempo no cambia qué toca entrenar.
  const week = generateWeek(
    { ...toTrainingProfile(profile), sessionMinutes: minutes },
    history,
    { weekStart: monday, catalog },
  );

  const recortado = week.workouts.find((candidate) => candidate.date === date);
  if (!recortado) throw new SessionNotFoundError();

  await prisma.workout.update({
    where: { id: workout.id },
    data: {
      trimmedMinutes: minutes,
      exercisesJson: {
        dayKind: recortado.dayKind,
        schemeLabel: recortado.schemeLabel,
        cardioMinutes: recortado.cardioMinutes,
        exercises: recortado.exercises,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    workoutId: workout.id,
    date,
    muscleGroup: recortado.muscleGroup,
    minutes,
    exercises: recortado.exercises.length,
    removed: Math.max(0, anterior.exercises.length - recortado.exercises.length),
  };
}

/** Deshace el recorte: la sesión vuelve a los minutos del perfil. */
export async function restoreSession(
  userId: string,
  profile: Profile,
  workoutId: string,
): Promise<TrimResult> {
  const result = await trimSession(userId, profile, workoutId, profile.sessionMinutes);
  await prisma.workout.update({ where: { id: result.workoutId }, data: { trimmedMinutes: null } });
  return result;
}

/** Para las vistas: los minutos del recorte, o `null` si está completa. */
export function trimmedMinutesOf(workout: Pick<Workout, "trimmedMinutes">): number | null {
  return workout.trimmedMinutes;
}
