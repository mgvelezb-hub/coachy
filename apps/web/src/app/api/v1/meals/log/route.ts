import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { fromISODate, isoFromDateColumn, shiftISODate, toISODate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * `GET /api/v1/meals/log` · `POST /api/v1/meals/log` — las comidas confirmadas.
 *
 * Es lo que convierte el apego a la dieta en un dato medido en vez de
 * recordado: cada comida se confirma en el momento y el check-in llega
 * prellenado con la cuenta real.
 *
 * Lo que NO hace: castigar. Una comida sin confirmar no cuenta como saltada —
 * cuenta como no respondida, que es distinto, y por eso el porcentaje se
 * calcula sobre las que sí se contestaron.
 *
 * `plannedAt` / `takenAt` / `skipped` son opcionales y nacieron con el
 * recordatorio en dos tiempos (Fase 2): sin ellos el registro sigue siendo el
 * "sí/no" de siempre; con ellos, el aprendizaje semanal de horarios
 * (`horarios-aprendidos.ts`) puede medir el desfase real contra el plan.
 */

export const dynamic = "force-dynamic";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "la fecha va en formato YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T12:00:00.000Z`)), "fecha inexistente");

const horaHHMM = z.string().regex(/^([01]?\d|2[0-3]):([0-5]\d)$/, "la hora va en formato 24 horas");

const MOTIVOS_SALTO = ["sin_hambre", "sin_tiempo", "comi_otra_cosa"] as const;

const schema = z.object({
  date: isoDate,
  slot: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Z_]+$/, "el slot va en mayúsculas"),
  taken: z.boolean(),
  /** Hora planeada ese día, copiada al registrar para poder medir el desfase después. */
  plannedAt: horaHHMM.optional(),
  /** Cuándo la comió de verdad. ISO completo: el reloj no vive en el teléfono, vive en el server. */
  takenAt: z.string().datetime().optional(),
  skipped: z.enum(MOTIVOS_SALTO).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const hoy = toISODate(new Date());
  // Sin rango explícito, el default sigue siendo la ventana de 14 días que ya
  // usaba el apego de check-in: cambiarla rompería a quien no manda from/to.
  const desde = url.searchParams.get("from") ?? shiftISODate(hoy, -13);
  const hasta = url.searchParams.get("to") ?? hoy;

  const filas = await prisma.mealLog.findMany({
    where: { userId: user.id, date: { gte: fromISODate(desde), lte: fromISODate(hasta) } },
    orderBy: { date: "desc" },
  });

  const registros = filas.map((fila) => ({
    date: isoFromDateColumn(fila.date),
    slot: fila.slot,
    taken: fila.taken,
    plannedAt: fila.plannedAt,
    takenAt: fila.takenAt ? fila.takenAt.toISOString() : null,
    skipped: fila.skipped,
  }));

  // El porcentaje sale de lo contestado, no del total del plan: una comida sin
  // responder no es una comida saltada.
  const contestadas = registros.length;
  const hechas = registros.filter((registro) => registro.taken).length;

  return NextResponse.json({
    registros,
    apego: contestadas === 0 ? null : Math.round((hechas / contestadas) * 100),
    contestadas,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "registro inválido" }, { status: 422 });
  }

  const { date, slot, taken, plannedAt, takenAt, skipped } = parsed.data;
  const takenAtDate = takenAt ? new Date(takenAt) : null;

  // Corregirse es normal —"sí la hice, me equivoqué al picarle"—, así que la
  // misma comida del mismo día se reescribe en vez de duplicarse.
  const fila = await prisma.mealLog.upsert({
    where: { userId_date_slot: { userId: user.id, date: fromISODate(date), slot } },
    create: { userId: user.id, date: fromISODate(date), slot, taken, plannedAt, takenAt: takenAtDate, skipped },
    update: { taken, plannedAt, takenAt: takenAtDate, skipped },
  });

  return NextResponse.json({
    registro: {
      date: isoFromDateColumn(fila.date),
      slot: fila.slot,
      taken: fila.taken,
      plannedAt: fila.plannedAt,
      takenAt: fila.takenAt ? fila.takenAt.toISOString() : null,
      skipped: fila.skipped,
    },
  });
}
