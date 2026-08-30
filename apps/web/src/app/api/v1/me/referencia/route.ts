import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { prisma } from "@/lib/prisma";

/**
 * `PATCH /api/v1/me/referencia` — la referencia numérica del objetivo.
 *
 * Guarda las medidas publicadas de la persona que se tomó como norte. El
 * servidor NO deriva metas: eso lo hace la app escalando por proporción
 * (`apps/mobile/src/lib/referencia.ts`), y ahí es donde viven los
 * guardarraíles —la cintura nunca por encima de la mitad de tu estatura, y el
 * porcentaje de grasa sin cruzar de un sexo a otro—.
 *
 * Los topes de aquí son de cordura, no clínicos: existen para que una medida
 * mal tecleada no se guarde como si fuera un dato.
 */

export const dynamic = "force-dynamic";

const medida = (min: number, max: number) => z.number().min(min).max(max).nullable();

const schema = z.object({
  referencia: z
    .object({
      nombre: z.string().trim().min(1).max(80),
      estaturaCm: z.number().min(120).max(230),
      sexo: z.enum(["FEMALE", "MALE"]),
      cinturaCm: medida(40, 200).default(null),
      musloCm: medida(25, 120).default(null),
      brazoCm: medida(15, 80).default(null),
      pechoCm: medida(50, 200).default(null),
      grasaPct: medida(3, 70).default(null),
      fuente: z.string().trim().max(300).nullable().default(null),
    })
    .nullable(),
});

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
      { error: "referencia inválida", detalles: parsed.error.issues.slice(0, 3) },
      { status: 422 },
    );
  }

  const profile = await prisma.profile.update({
    where: { userId: user.id },
    // `null` explícito borra la referencia; `undefined` no llegaría nunca
    // porque el esquema exige el campo.
    data: { goalReference: parsed.data.referencia ?? Prisma.DbNull },
    select: { goalReference: true },
  });

  return NextResponse.json({ referencia: profile.goalReference });
}
