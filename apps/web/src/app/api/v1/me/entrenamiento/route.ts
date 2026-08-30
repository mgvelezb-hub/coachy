import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { prisma } from "@/lib/prisma";
import { DISCIPLINES, MUSCLE_GROUPS, SWIM_LEVELS } from "@/lib/training/types";

/**
 * `PATCH /api/v1/me/entrenamiento` — las preferencias que cambian la rutina.
 *
 * Dos cosas, y las dos mandan de verdad sobre la semana que arma el generador:
 *
 * - **Grupos que no quieres repetir**: se entrenan una vez y los días que los
 *   repetían pasan a trabajar otra cosa. La semana no se encoge.
 * - **Disciplinas activas**: gastan del presupuesto semanal. Agregar natación
 *   dos veces no suma dos sesiones encima — se las quita al gimnasio.
 *
 * Aplica desde la siguiente vez que se arme la rutina; la semana en curso ya
 * está publicada y moverla a medio martes solo confunde.
 */

export const dynamic = "force-dynamic";

const schema = z
  .object({
    avoidRepeatGroups: z.array(z.enum(MUSCLE_GROUPS)).max(MUSCLE_GROUPS.length).optional(),
    primaryDiscipline: z.enum(DISCIPLINES).optional(),
    /** Nivel en el agua: ordena volumen y descansos de la sesión de natación. */
    swimLevel: z.enum(SWIM_LEVELS).optional(),
    /**
     * Nivel declarado por disciplina. Se manda el mapa entero: es lo que la
     * pantalla tiene en la mano, y parcharlo llave por llave abriría la puerta
     * a que dos ediciones seguidas se pisen.
     */
    disciplineLevels: z.record(z.enum(DISCIPLINES), z.enum(SWIM_LEVELS)).optional(),
    otherDisciplines: z
      .array(
        z.object({
          discipline: z.enum(DISCIPLINES),
          /** 0 = declarada pero sin carga: se registra, no planea. */
          sessionsPerWeek: z.number().int().min(0).max(7),
        }),
      )
      .max(DISCIPLINES.length)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "no hay nada que guardar" })
  .refine(
    (value) =>
      value.otherDisciplines === undefined ||
      new Set(value.otherDisciplines.map((load) => load.discipline)).size ===
        value.otherDisciplines.length,
    { message: "una disciplina repetida contaría doble en el presupuesto" },
  );

export async function PATCH(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();
  if (!user.profile) {
    return NextResponse.json({ error: "onboarding incompleto" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "preferencias inválidas", detalles: parsed.error.issues.slice(0, 3) },
      { status: 422 },
    );
  }

  const { avoidRepeatGroups, primaryDiscipline, otherDisciplines, swimLevel, disciplineLevels } =
    parsed.data;

  // La primaria no puede estar además en la lista de secundarias: se cobraría
  // dos veces del mismo presupuesto.
  const primary = primaryDiscipline ?? user.profile.primaryDiscipline;
  const others = otherDisciplines?.filter((load) => load.discipline !== primary);

  const profile = await prisma.profile.update({
    where: { userId: user.id },
    data: {
      ...(avoidRepeatGroups !== undefined ? { avoidRepeatGroups } : {}),
      ...(primaryDiscipline !== undefined ? { primaryDiscipline } : {}),
      ...(others !== undefined ? { otherDisciplines: others } : {}),
      ...(swimLevel !== undefined ? { swimLevel } : {}),
      ...(disciplineLevels !== undefined ? { disciplineLevels } : {}),
    },
    select: {
      avoidRepeatGroups: true,
      primaryDiscipline: true,
      otherDisciplines: true,
      swimLevel: true,
      disciplineLevels: true,
    },
  });

  return NextResponse.json(profile);
}
