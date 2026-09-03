import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import {
  DIAS_SEMANA,
  normalizaHorarios,
  parseMealTimes,
  parseMealTimesByDay,
  validaHorarios,
} from "@/lib/coachy/horarios";
import { tiemposVigentes } from "@/lib/coachy/tiempos";
import { prisma } from "@/lib/prisma";

/**
 * `GET|PUT /api/v1/me/horarios-comida` — a qué hora come esta persona.
 *
 * El motor sugiere una hora por tiempo de comida a partir de una jornada
 * estándar. Quien entra a trabajar a las 6, come a las 4 o entrena de noche
 * veía horas que no iba a cumplir, y un horario que no se cumple no es un
 * plan: es un recordatorio a deshoras.
 *
 * Los candados viven en `lib/coachy/horarios.ts` (orden, separación mínima,
 * ventana del día) y aquí solo se aplican: mover horas tiene consecuencias
 * fisiológicas y la app no puede fingir que da lo mismo. Cuando algo no cabe,
 * la respuesta trae el motivo en palabras para que la pantalla lo diga.
 *
 * `GET` devuelve los tiempos del menú vigente ya con la hora que rige —la
 * propia si la movió, la del motor si no— para que la app no tenga que
 * cruzar dos fuentes.
 *
 * `?dia=SAB` opera sobre `mealTimesByDay` en vez de `mealTimes`: nació del
 * fin de semana, donde nadie desayuna a la misma hora que entre semana y el
 * horario general se vuelve ruido dos días de cada siete. Sin `dia`, ambos
 * verbos siguen tocando el horario general, igual que antes de que existiera
 * el horario por día.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  /** `{ "COMIDA": "15:00" }`. Un slot con `null` vuelve a la hora del motor (o la general, si `dia`). */
  horarios: z.record(z.string(), z.string().nullable()),
  /** Si viene, los cambios son solo de ese día de la semana. */
  dia: z.enum(DIAS_SEMANA).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();
  if (!user.profile) {
    return NextResponse.json({ error: "onboarding incompleto" }, { status: 403 });
  }

  const generales = parseMealTimes(user.profile.mealTimes);
  const porDia = parseMealTimesByDay(user.profile.mealTimesByDay);

  const url = new URL(request.url);
  const dia = url.searchParams.get("dia");

  if (dia && (DIAS_SEMANA as readonly string[]).includes(dia)) {
    const horariosDia = porDia[dia] ?? {};
    const efectivos = { ...generales, ...horariosDia };
    return NextResponse.json({
      horarios: horariosDia,
      tiempos: await tiemposVigentes(user.id, user.profile, efectivos),
    });
  }

  return NextResponse.json({
    horarios: generales,
    tiempos: await tiemposVigentes(user.id, user.profile, generales),
    // Resumen de cuántos tiempos movió cada día, para la lista "un renglón
    // por día" sin que la pantalla tenga que pedir los siete por separado.
    horariosPorDia: porDia,
  });
}

export async function PUT(request: Request): Promise<NextResponse> {
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
    return NextResponse.json({ error: "horarios inválidos" }, { status: 422 });
  }

  const { dia, horarios: cambios } = parsed.data;
  const generales = parseMealTimes(user.profile.mealTimes);

  if (dia) {
    const porDia = parseMealTimesByDay(user.profile.mealTimesByDay);
    const mezclaDia: Record<string, string> = { ...(porDia[dia] ?? {}) };
    for (const [slot, hora] of Object.entries(cambios)) {
      if (hora === null) delete mezclaDia[slot];
      else mezclaDia[slot] = hora;
    }

    const horariosDia = normalizaHorarios(mezclaDia);
    // Se valida el día completo ya mezclado con el horario general: la
    // separación entre dos comidas de un sábado depende de las dos, aunque
    // solo una de ellas la haya movido este día en particular.
    const efectivos = { ...generales, ...horariosDia };
    const tiempos = await tiemposVigentes(user.id, user.profile, efectivos);

    const validacion = validaHorarios(tiempos);
    if (!validacion.ok) {
      return NextResponse.json(
        { error: validacion.errores[0] ?? "Ese horario no se puede guardar", errores: validacion.errores },
        { status: 422 },
      );
    }

    const nuevoPorDia = { ...porDia };
    if (Object.keys(horariosDia).length > 0) nuevoPorDia[dia] = horariosDia;
    else delete nuevoPorDia[dia];

    await prisma.profile.update({
      where: { userId: user.id },
      data: { mealTimesByDay: Object.keys(nuevoPorDia).length > 0 ? nuevoPorDia : undefined },
    });

    return NextResponse.json({ horarios: horariosDia, tiempos, avisos: validacion.avisos });
  }

  // Un slot en `null` se borra: vuelve a regir la hora que sugiere el motor.
  const mezcla: Record<string, string> = { ...generales };
  for (const [slot, hora] of Object.entries(cambios)) {
    if (hora === null) delete mezcla[slot];
    else mezcla[slot] = hora;
  }

  const horarios = normalizaHorarios(mezcla);
  const tiempos = await tiemposVigentes(user.id, user.profile, horarios);

  // Se valida el DÍA COMPLETO, no el campo suelto: la separación entre dos
  // comidas solo existe si se miran las dos.
  const validacion = validaHorarios(tiempos);
  if (!validacion.ok) {
    return NextResponse.json(
      { error: validacion.errores[0] ?? "Ese horario no se puede guardar", errores: validacion.errores },
      { status: 422 },
    );
  }

  await prisma.profile.update({
    where: { userId: user.id },
    data: { mealTimes: Object.keys(horarios).length > 0 ? horarios : undefined },
  });

  return NextResponse.json({ horarios, tiempos, avisos: validacion.avisos });
}
