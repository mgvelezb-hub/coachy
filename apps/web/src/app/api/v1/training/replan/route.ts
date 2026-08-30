import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { prisma } from "@/lib/prisma";
import { ensureWeekMaterialized } from "@/lib/training/db";
import { PROPOSITOS, horarioDesde, replanificar, type TiempoPorDia } from "@/lib/training/replan";
import { WEEK_DAYS } from "@/lib/training/split";
import { DISCIPLINES } from "@/lib/training/types";

/**
 * `POST /api/v1/training/replan` — rearmar la semana desde cero.
 *
 * Recibe lo que la persona contestó —cuánto tiempo tiene cada día, qué
 * disciplina manda, cuáles acompañan y para qué sirve cada una— y devuelve un
 * reparto que **cabe de verdad**, con sus avisos cuando algo no entró.
 *
 * El reparto lo hace un módulo puro (`lib/training/replan.ts`); aquí solo se
 * guarda y se rearma la semana. Esa separación es la que permite probar las
 * reglas de cabida sin base de datos.
 *
 * Lo que NO se toca: el historial. `ensureWeekMaterialized` solo borra días de
 * hoy en adelante sin series capturadas — un día entrenado es historia y la
 * historia no se reescribe.
 */

export const dynamic = "force-dynamic";

const AGE_RANGES = ["18_24", "25_34", "35_44", "45_54", "55_64", "65_MAS"] as const;

const schema = z.object({
  /** Minutos disponibles por día. 0 = ese día no se entrena. */
  tiempo: z.record(z.enum(WEEK_DAYS), z.number().int().min(0).max(300)),
  primaria: z.enum(DISCIPLINES),
  sesionesPrimaria: z.number().int().min(0).max(7),
  secundarias: z
    .array(
      z.object({
        discipline: z.enum(DISCIPLINES),
        proposito: z.enum(PROPOSITOS),
        importancia: z.number().int().min(1).max(3),
      }),
    )
    .max(DISCIPLINES.length),
  /** Solo si el perfil no tiene fecha de nacimiento. */
  ageRange: z.enum(AGE_RANGES).nullable().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
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
      { error: "respuestas inválidas", detalles: parsed.error.issues.slice(0, 3) },
      { status: 422 },
    );
  }

  const { tiempo, primaria, sesionesPrimaria, secundarias, ageRange } = parsed.data;

  // La primaria no puede además estar en la lista de secundarias: se contaría
  // dos veces sobre el mismo presupuesto.
  const otras = secundarias.filter((entrada) => entrada.discipline !== primaria);

  const completo = Object.fromEntries(
    WEEK_DAYS.map((dia) => [dia, tiempo[dia] ?? 0]),
  ) as TiempoPorDia;

  const replan = replanificar({
    tiempo: completo,
    primaria,
    secundarias: otras,
    sesionesPrimaria,
  });

  const sesionesDePesas =
    replan.cargas.find((carga) => carga.discipline === "PESAS")?.sessionsPerWeek ?? 0;

  // Los minutos por sesión salen del día más corto que quedó activo: es lo que
  // de verdad limita cuántos ejercicios caben.
  const minutosPorSesion = replan.diasActivos.length
    ? Math.min(...replan.diasActivos.map((dia) => completo[dia]))
    : user.profile.sessionMinutes;

  await prisma.profile.update({
    where: { userId: user.id },
    data: {
      primaryDiscipline: primaria,
      // `liftingDays` es el presupuesto semanal de sesiones; el generador le
      // resta lo que se llevan las otras disciplinas.
      liftingDays: replan.asignadas.length,
      sessionMinutes: Math.max(20, Math.min(120, minutosPorSesion)),
      trainingSchedule: horarioDesde(replan, user.profile.trainingTime),
      otherDisciplines: replan.cargas.filter((carga) => carga.discipline !== primaria),
      // El tiempo que la persona declaró día por día: es lo que hace honesto
      // el reparto de un día combinado la próxima vez que se arme la semana
      // (`timePerDay` en `disciplines.ts`), en vez de volver a preguntarlo.
      timePerDay: completo,
      ...(ageRange !== undefined && !user.profile.birthDate ? { ageRange } : {}),
    },
  });

  // Se rearma la semana ya, para que la respuesta pueda enseñar el resultado
  // real y no una promesa de lo que pasará al abrir Rutinas.
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  const perfil = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
  await ensureWeekMaterialized(user.id, perfil, hoy);

  return NextResponse.json({
    asignadas: replan.asignadas,
    cargas: replan.cargas,
    diasActivos: replan.diasActivos,
    avisos: replan.avisos,
    sesionesDePesas,
  });
}
