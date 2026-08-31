import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { materializeMealPlans } from "@/lib/coachy/menu";
import { prisma } from "@/lib/prisma";
import { PROPOSITOS } from "@/lib/training/replan";
import { WEEK_DAYS } from "@/lib/training/split";
import { TRAINING_TIMES, bloqueDelMotor } from "@/lib/training/horario";
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
 * Cada disciplina también puede traer `proposito` e `importancia` — lo mismo
 * que se pregunta al rearmar la rutina (`/api/v1/training/replan`) — y el
 * perfil puede traer `timePerDay`, los minutos declarados por día. Guardarlos
 * aquí también es lo que evita preguntar dos veces lo mismo.
 *
 * `compactDays` (Fase 10) también vive aquí y no en el flujo de replanificar:
 * es una preferencia de "cómo armo tu semana", no una respuesta de "cuánto
 * tiempo tengo" — se ajusta un toque en Ajustes, no rehaciendo el
 * cuestionario completo.
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
    // `partialRecord`, no `record`: en zod 4 un record con llave enum exige
    // TODAS las llaves, y este mapa trae solo las disciplinas que la persona
    // tiene. Con `record`, subir el nivel de pesas devolvía 422 porque
    // "faltaban" crossfit y funcional.
    disciplineLevels: z.partialRecord(z.enum(DISCIPLINES), z.enum(SWIM_LEVELS)).optional(),
    otherDisciplines: z
      .array(
        z.object({
          discipline: z.enum(DISCIPLINES),
          /** 0 = declarada pero sin carga: se registra, no planea. */
          sessionsPerWeek: z.number().int().min(0).max(7),
          /** Para qué sirve esta disciplina — lo que se pregunta al rearmar la rutina. */
          proposito: z.enum(PROPOSITOS).optional(),
          /** 1 a 3: cuánto quiere la persona que pese, dentro de su propósito. */
          importancia: z.number().int().min(1).max(3).optional(),
        }),
      )
      .max(DISCIPLINES.length)
      .optional(),
    /**
     * Minutos disponibles por día. `null` limpia lo declarado (vuelve a los
     * defaults); omitido deja lo que ya había. 0 = ese día no se entrena.
     */
    timePerDay: z.partialRecord(z.enum(WEEK_DAYS), z.number().int().min(0).max(300)).nullable().optional(),
    /**
     * Combinar disciplinas compatibles el mismo día (`true`) o darle a cada
     * una su propio día (`false`). Ver el docblock de `compactDays` en
     * `schema.prisma` para el porqué del default.
     */
    compactDays: z.boolean().optional(),
    /**
     * A qué hora entrena, parejo toda la semana.
     *
     * Cambia la ESTRUCTURA de las comidas, no solo una etiqueta: quien
     * entrena en la mañana desayuna antes de entrenar y come fuerte después;
     * quien entrena de noche desayuna bajo en carbohidratos y se los guarda
     * para la tarde. Por eso, al cambiarlo, el menú se vuelve a armar.
     */
    trainingTime: z.enum(TRAINING_TIMES).optional(),
    /**
     * Horario por día, para quien no entrena a la misma hora toda la semana:
     * `{ "LUN": "MANANA", "MAR": "NOCHE", "MIE": "DESCANSO" }`. `null` lo
     * limpia y vuelve a mandar el horario parejo.
     */
    trainingSchedule: z
      .partialRecord(z.enum(WEEK_DAYS), z.enum([...TRAINING_TIMES, "DESCANSO"]))
      .nullable()
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

  const {
    avoidRepeatGroups,
    primaryDiscipline,
    otherDisciplines,
    swimLevel,
    disciplineLevels,
    timePerDay,
    compactDays,
    trainingTime,
    trainingSchedule,
  } = parsed.data;

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
      // `null` limpia la columna: Prisma exige `Prisma.JsonNull` explícito
      // para no confundirlo con "no tocar este campo".
      ...(timePerDay !== undefined ? { timePerDay: timePerDay ?? Prisma.JsonNull } : {}),
      ...(compactDays !== undefined ? { compactDays } : {}),
      ...(trainingTime !== undefined ? { trainingTime } : {}),
      ...(trainingSchedule !== undefined
        ? { trainingSchedule: trainingSchedule ?? Prisma.JsonNull }
        : {}),
    },
    select: {
      avoidRepeatGroups: true,
      primaryDiscipline: true,
      otherDisciplines: true,
      swimLevel: true,
      disciplineLevels: true,
      timePerDay: true,
      compactDays: true,
      trainingTime: true,
      trainingSchedule: true,
    },
  });

  // Cambiar la hora de entrenar no es cambiar una etiqueta: mueve el reparto
  // de carbohidratos del día completo (quien entrena de noche desayuna bajo
  // en carbos y se los guarda para la tarde). Si el cambio cruza de mañana a
  // tarde —o al revés— el menú se rearma con la MISMA semilla, así que los
  // alimentos siguen siendo reconocibles y lo que cambia es la estructura.
  let menuRearmado = false;
  if (trainingTime !== undefined && bloqueDelMotor(trainingTime) !== bloqueDelMotor(user.profile.trainingTime)) {
    try {
      const decision = await prisma.decision.findFirst({
        where: { userId: user.id, status: { in: ["APROBADA", "CORREGIDA"] } },
        orderBy: { createdAt: "desc" },
        include: { checkIn: { select: { date: true } } },
      });

      if (decision) {
        const completo = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
        await materializeMealPlans(decision, completo, { overwrite: true });
        menuRearmado = true;
      }
    } catch (error) {
      // El horario SÍ se guardó; lo que falló es rearmar el menú. Se dice en
      // la respuesta en vez de fingir que todo salió bien: el menú viejo
      // sigue siendo comestible, solo que con la estructura anterior.
      console.error("[coachy] no se pudo rearmar el menú tras cambiar el horario", error);
    }
  }

  return NextResponse.json({ ...profile, menuRearmado });
}
