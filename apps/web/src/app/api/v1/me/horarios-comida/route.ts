import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { currentMealPlan } from "@/lib/coachy/menu";
import {
  normalizaHorarios,
  parseMealTimes,
  validaHorarios,
  type TiempoDeComida,
} from "@/lib/coachy/horarios";
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
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  /** `{ "COMIDA": "15:00" }`. Un slot con `null` vuelve a la hora del motor. */
  horarios: z.record(z.string(), z.string().nullable()),
});

/** Los tiempos del menú vigente, en el orden del motor, con su hora efectiva. */
async function tiemposDe(
  userId: string,
  profile: NonNullable<Awaited<ReturnType<typeof apiUser>>>["profile"],
  horarios: Record<string, string>,
): Promise<TiempoDeComida[]> {
  if (!profile) return [];

  const nutrition = await currentMealPlan(userId, profile).catch(() => null);
  const meals = nutrition?.plans[0]?.mealsJson;
  if (!Array.isArray(meals)) return [];

  return meals.map((raw) => {
    const meal = raw as Record<string, unknown>;
    const slot = String(meal.slot ?? "");
    return {
      slot,
      label: String(meal.label ?? slot),
      hora: horarios[slot] ?? String(meal.timeHint ?? ""),
      propia: horarios[slot] !== undefined,
    };
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();
  if (!user.profile) {
    return NextResponse.json({ error: "onboarding incompleto" }, { status: 403 });
  }

  const horarios = parseMealTimes(user.profile.mealTimes);
  return NextResponse.json({
    horarios,
    tiempos: await tiemposDe(user.id, user.profile, horarios),
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

  // Un slot en `null` se borra: vuelve a regir la hora que sugiere el motor.
  const previos = parseMealTimes(user.profile.mealTimes);
  const mezcla: Record<string, string> = { ...previos };
  for (const [slot, hora] of Object.entries(parsed.data.horarios)) {
    if (hora === null) delete mezcla[slot];
    else mezcla[slot] = hora;
  }

  const horarios = normalizaHorarios(mezcla);
  const tiempos = await tiemposDe(user.id, user.profile, horarios);

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
