import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { prisma } from "@/lib/prisma";
import { parseDisciplineLoads, ensureWeekMaterialized, toTrainingProfile } from "@/lib/training/db";
import { PROPOSITOS, replanificar, type TiempoPorDia } from "@/lib/training/replan";
import { WEEK_DAYS, trainingDaysOf } from "@/lib/training/split";
import { DISCIPLINES } from "@/lib/training/types";

/**
 * `POST /api/v1/training/recalibrar` — mover el peso entre disciplinas.
 *
 * Es el hermano ligero de `replan`: ahí se contesta todo de nuevo, aquí solo se
 * mueve cuánto pesa cada disciplina sobre la semana que ya existe. Es lo que se
 * quiere después de dos semanas —"nadar me está gustando, quiero más"— sin
 * volver a declarar horarios ni objetivo.
 *
 * El tiempo por día NO se pregunta otra vez: se lee del horario y de los
 * minutos por sesión que ya están en el perfil. Si el reparto nuevo no cabe,
 * se dice — subir la importancia de una disciplina no crea días.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  pesos: z
    .array(
      z.object({
        discipline: z.enum(DISCIPLINES),
        proposito: z.enum(PROPOSITOS),
        /** 1 a 3: cuánto quiere que pese, dentro de su propósito. */
        importancia: z.number().int().min(1).max(3),
      }),
    )
    .min(1)
    .max(DISCIPLINES.length),
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
    return NextResponse.json({ error: "pesos inválidos" }, { status: 422 });
  }

  const perfil = user.profile;
  const entrenamiento = toTrainingProfile(perfil);
  const primaria = perfil.primaryDiscipline;

  /**
   * El tiempo que ya se declaró, no uno nuevo.
   *
   * Los días activos salen del horario del perfil y todos valen los mismos
   * minutos por sesión: es lo que la persona configuró, y recalibrar no es
   * momento de renegociarlo.
   */
  const activos = new Set(trainingDaysOf(entrenamiento));
  const tiempo = Object.fromEntries(
    WEEK_DAYS.map((dia) => [dia, activos.has(dia) ? perfil.sessionMinutes : 0]),
  ) as TiempoPorDia;

  const pesos = parsed.data.pesos.filter((peso) => peso.discipline !== primaria);
  const dePrimaria = parsed.data.pesos.find((peso) => peso.discipline === primaria);

  // Cuántas sesiones pide la primaria: si la persona bajó su importancia, se
  // reparte a las demás; si la subió, se lleva más días.
  const totalDias = activos.size;
  const sesionesPrimaria = dePrimaria
    ? Math.max(1, Math.round((totalDias * dePrimaria.importancia) / 3))
    : Math.max(1, Math.round(totalDias / 2));

  const replan = replanificar({
    tiempo,
    primaria,
    secundarias: pesos,
    sesionesPrimaria,
  });

  const cargasNuevas = replan.cargas.filter((carga) => carga.discipline !== primaria);
  const cargasAnteriores = parseDisciplineLoads(perfil.otherDisciplines);

  await prisma.profile.update({
    where: { userId: user.id },
    data: {
      liftingDays: replan.asignadas.length,
      otherDisciplines: cargasNuevas,
    },
  });

  const actualizado = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  await ensureWeekMaterialized(user.id, actualizado, hoy);

  return NextResponse.json({
    asignadas: replan.asignadas,
    cargas: replan.cargas,
    avisos: replan.avisos,
    /** Qué cambió respecto de lo que había, para poder enseñarlo. */
    cambios: cargasNuevas.map((carga) => ({
      discipline: carga.discipline,
      antes: cargasAnteriores.find((previa) => previa.discipline === carga.discipline)?.sessionsPerWeek ?? 0,
      ahora: carga.sessionsPerWeek,
    })),
  });
}
