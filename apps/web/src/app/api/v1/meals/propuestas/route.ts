import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { calculaPropuestas, type RegistroComidaAprendizaje } from "@/lib/coachy/horarios-aprendidos";
import { parseMealTimes } from "@/lib/coachy/horarios";
import { tiemposVigentes } from "@/lib/coachy/tiempos";
import { fromISODate, horaEnZona, isoFromDateColumn, shiftISODate, toISODate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * `GET /api/v1/meals/propuestas` — las propuestas de mover un horario.
 *
 * Mira las últimas dos semanas de `MealLog` (hora planeada vs. hora real
 * confirmada) y las pasa por `calculaPropuestas`, que ya trae los candados
 * de `horarios.ts` aplicados. Esta ruta solo junta los datos; la decisión de
 * cuándo proponer vive entera en el módulo puro, para poder probarla sin
 * base de datos.
 *
 * Nunca escribe: se enseña como tarjeta accionable (check-in, Nutrición) y
 * el "Mover" que la persona toca es el que de verdad guarda, contra
 * `PUT /api/v1/me/horarios-comida`.
 */

export const dynamic = "force-dynamic";

const SEMANAS_DE_EVIDENCIA = 14;

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();
  if (!user.profile) {
    return NextResponse.json({ error: "onboarding incompleto" }, { status: 403 });
  }

  const horarios = parseMealTimes(user.profile.mealTimes);
  const tiempos = await tiemposVigentes(user.id, user.profile, horarios);
  if (tiempos.length === 0) {
    return NextResponse.json({ propuestas: [] });
  }

  const hoy = toISODate(new Date());
  const desde = shiftISODate(hoy, -(SEMANAS_DE_EVIDENCIA - 1));

  const filas = await prisma.mealLog.findMany({
    where: { userId: user.id, date: { gte: fromISODate(desde) } },
  });

  const registros: RegistroComidaAprendizaje[] = filas.map((fila) => ({
    slot: fila.slot,
    date: isoFromDateColumn(fila.date),
    plannedAt: fila.plannedAt,
    takenHora: fila.takenAt ? horaEnZona(fila.takenAt) : null,
  }));

  return NextResponse.json({ propuestas: calculaPropuestas(registros, tiempos) });
}
