import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { puntoCeroDe } from "@/lib/checkins";
import { isoFromDateColumn } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * `PUT /api/v1/me/punto-cero` — declarar (o quitar) la referencia desde la
 * que se compara todo.
 *
 * Quien vuelve a entrenar tras meses parada arrastra un historial que ya no
 * la describe: comparar su cintura de hoy contra la de hace un año pinta
 * como retroceso el arranque de una etapa nueva. Marcando un check-in como
 * punto cero, avances, gráficas y fotos empiezan a contarse desde ahí.
 *
 * Lo que NO hace: borrar. El historial anterior se queda íntegro en la base y
 * vuelve a verse en cuanto se quita el punto cero (`checkInId: null`). Esto
 * mueve la vara, no la memoria.
 *
 * `GET` devuelve el punto cero vigente, para que la app pueda decir desde
 * cuándo está comparando sin adivinarlo.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  /** `null` quita el punto cero y devuelve la vara al primer check-in. */
  checkInId: z.string().uuid().nullable(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const punto = await puntoCeroDe(user.id);
  return NextResponse.json({
    puntoCero: punto ? { checkInId: punto.checkInId, date: isoFromDateColumn(punto.date) } : null,
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
    return NextResponse.json({ error: "check-in inválido" }, { status: 422 });
  }

  const { checkInId } = parsed.data;

  // Solo un check-in PROPIO puede ser la referencia: sin esta verificación,
  // un id ajeno filtraría la fecha de otra persona en la respuesta.
  if (checkInId !== null) {
    const suyo = await prisma.checkIn.findFirst({
      where: { id: checkInId, userId: user.id },
      select: { id: true },
    });
    if (!suyo) {
      return NextResponse.json({ error: "ese check-in no existe" }, { status: 404 });
    }
  }

  await prisma.profile.update({
    where: { userId: user.id },
    data: { baselineCheckInId: checkInId },
  });

  const punto = await puntoCeroDe(user.id);
  return NextResponse.json({
    puntoCero: punto ? { checkInId: punto.checkInId, date: isoFromDateColumn(punto.date) } : null,
  });
}
