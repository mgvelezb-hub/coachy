import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { prisma } from "@/lib/prisma";
import {
  TIPOS_BLOQUE,
  agregarBloqueDelDia,
  avisoDeBloque,
  parseDayBlocks,
  quitarBloqueDelDia,
} from "@/lib/training/bloques-dia";
import { fromISODate } from "@/lib/format";
import { parseStoredPlan } from "@/lib/training/db";
import { DISCIPLINES, type DayKind } from "@/lib/training/types";

/**
 * `POST /api/v1/training/bloque-dia` — agregar un bloque a un día concreto.
 *
 * El cambio de modelo de la Fase 12: la disciplina base se planea; lo demás se
 * decide EL DÍA, con el tiempo que sobra. Nadie sabe en lunes que el jueves va
 * a tener cuarenta minutos libres para nadar, y hacerle prometer sesiones por
 * semana a algo que se hace cuando se puede es lo que llenaba la semana de
 * planes incumplidos.
 *
 * `tipo: ENTRENO` pide que Coachy prescriba la sesión de esa disciplina con
 * los minutos dados; `LIBRE` solo reserva el tiempo y deja que el reloj
 * registre lo que pase. El bloque va ENCIMA del día —después del de la base— y
 * se puede quitar el mismo día (`DELETE`).
 *
 * Los avisos de compatibilidad (pierna pesada y squash) se devuelven en la
 * respuesta y NUNCA bloquean: quien lo pidió a propósito ya sabe lo que pide.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  /** ISO `YYYY-MM-DD`. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  discipline: z.enum(DISCIPLINES),
  tipo: z.enum(TIPOS_BLOQUE),
  minutos: z.number().int().min(5).max(300),
});

const borrado = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  discipline: z.enum(DISCIPLINES),
});

/**
 * `GET /api/v1/training/bloque-dia?date=YYYY-MM-DD` — los bloques de ese día.
 *
 * La hoja necesita saber qué hay ya puesto para poder quitarlo; la semana
 * (`/training/week`) los trae como sesiones, que es otra cosa: ahí ya están
 * prescritos y mezclados con lo planeado.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();
  if (!user.profile) {
    return NextResponse.json({ error: "onboarding incompleto" }, { status: 403 });
  }

  const date = new URL(request.url).searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const bloques = parseDayBlocks(user.profile.dayBlocks)[date] ?? [];

  return NextResponse.json({
    date,
    bloques,
    // La base no se puede agregar como bloque: ya está en el plan.
    base: user.profile.primaryDiscipline,
    dayKind: await dayKindDe(user.id, date),
  });
}

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
    return NextResponse.json({ error: "bloque inválido" }, { status: 422 });
  }

  const { date, discipline, tipo, minutos } = parsed.data;

  // La disciplina base ya tiene su lugar en el plan: agregarla otra vez como
  // bloque del día sería contarla dos veces el mismo día.
  if (discipline === user.profile.primaryDiscipline) {
    return NextResponse.json(
      { error: "Esa es tu disciplina base: ya está en el plan de tu semana." },
      { status: 422 },
    );
  }

  const hoyISO = new Date().toISOString().slice(0, 10);
  if (date < hoyISO) {
    return NextResponse.json(
      { error: "Ese día ya pasó. Lo que se entrenó es historia y no se reescribe." },
      { status: 422 },
    );
  }

  const siguiente = agregarBloqueDelDia(parseDayBlocks(user.profile.dayBlocks), date, {
    discipline,
    tipo,
    minutos,
  });

  await prisma.profile.update({
    where: { userId: user.id },
    data: { dayBlocks: siguiente as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({
    date,
    bloques: siguiente[date] ?? [],
    // Se avisa, no se impide: la sesión de pesas de ese día es lo que decide
    // si pierna y squash se van a estorbar.
    aviso: avisoDeBloque(discipline, { dayKind: await dayKindDe(user.id, date) }),
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
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

  const parsed = borrado.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bloque inválido" }, { status: 422 });
  }

  const { date, discipline } = parsed.data;
  const siguiente = quitarBloqueDelDia(parseDayBlocks(user.profile.dayBlocks), date, discipline);

  await prisma.profile.update({
    where: { userId: user.id },
    data: { dayBlocks: siguiente as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ date, bloques: siguiente[date] ?? [] });
}

/** Qué se entrena en el gimnasio ese día, si ya hay sesión materializada. */
async function dayKindDe(userId: string, date: string): Promise<DayKind | null> {
  const workout = await prisma.workout
    .findFirst({
      where: { userId, date: fromISODate(date) },
      select: { exercisesJson: true },
    })
    .catch(() => null);

  if (!workout) return null;
  return (parseStoredPlan(workout.exercisesJson).dayKind as DayKind | null) ?? null;
}
