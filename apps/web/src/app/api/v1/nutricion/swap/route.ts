import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { toMenuView } from "@/lib/coachy/menu-view";
import { SwapError, applySwap } from "@/lib/coachy/swap";
import { prisma } from "@/lib/prisma";

/**
 * `POST /api/v1/nutricion/swap` — elegir una equivalencia y que se quede.
 *
 * Antes, tocar una equivalencia en el menú era de solo lectura: se mostraba
 * la opción, pero el `mealsJson` guardado nunca cambiaba, así que un refresh
 * la perdía. Aquí el intercambio se aplica sobre lo guardado y se persiste —
 * el menú, el widget y cualquier vista que lea `GET /nutrition` lo ven así
 * desde ya, sin trabajo extra: todos leen la misma fila.
 *
 * La transformación en sí (`applySwap`, `@/lib/coachy/swap`) es pura y
 * REVERSIBLE: la opción elegida se reemplaza en la equivalencia por el
 * alimento que salió, con sus gramos originales, así que volver a tocar
 * "cambiar" y elegir el original regresa exactamente a donde estaba.
 *
 * `groceryListJson` NO se toca aquí a propósito: un intercambio puntual —
 * "hoy cambio la avena por amaranto"— no rehace la lista de compra de la
 * semana completa. Para eso está `POST /nutricion/regenerar-menu`, que sí
 * vuelve a armar la lista desde cero.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  menuNumber: z.number().int().positive(),
  slot: z.string().trim().min(1),
  forName: z.string().trim().min(1),
  toName: z.string().trim().min(1),
});

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
    return NextResponse.json(
      { error: "datos inválidos", detalles: parsed.error.issues.slice(0, 3) },
      { status: 422 },
    );
  }

  const { menuNumber, slot, forName, toName } = parsed.data;

  const decision = await prisma.decision.findFirst({
    where: { userId: user.id, status: "APROBADA" },
    orderBy: { checkIn: { date: "desc" } },
    select: { id: true },
  });

  if (!decision) {
    return NextResponse.json(
      { error: "No tienes una decisión aprobada vigente." },
      { status: 404 },
    );
  }

  const mealPlan = await prisma.mealPlan.findUnique({
    where: { decisionId_menuNumber: { decisionId: decision.id, menuNumber } },
  });

  if (!mealPlan) {
    return NextResponse.json({ error: `No existe el menú ${menuNumber}.` }, { status: 404 });
  }

  let result;
  try {
    result = applySwap(mealPlan.mealsJson, mealPlan.equivalencesJson, { slot, forName, toName });
  } catch (error) {
    if (error instanceof SwapError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }

  const updated = await prisma.mealPlan.update({
    where: { id: mealPlan.id },
    data: {
      mealsJson: result.mealsJson as Prisma.InputJsonValue,
      equivalencesJson: result.equivalencesJson as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ menu: toMenuView(updated.menuNumber, updated.mealsJson) });
}
