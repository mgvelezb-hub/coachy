import { NextResponse } from "next/server";
import { z } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { prisma } from "@/lib/prisma";

/**
 * `PATCH /api/v1/me/resumen` — cómo quiere ver su Resumen.
 *
 * El servidor guarda el acomodo pero **no valida qué paneles existen**: el
 * catálogo vive en la app, cambia con cada versión, y un servidor que rechace
 * un panel que todavía no conoce rompería a quien ya actualizó. Lo que sí se
 * valida es la forma —ids razonables, sin repetidos, con una variante y un
 * ancho de la lista— y el cliente ignora los ids que no reconoce.
 */

export const dynamic = "force-dynamic";

const panelSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "el id va en minúsculas, sin espacios"),
  variante: z.enum(["compacto", "normal", "detallado"]),
  ancho: z.enum(["medio", "ancho"]),
});

const schema = z.object({
  paneles: z
    .array(panelSchema)
    .max(40)
    .refine((paneles) => new Set(paneles.map((panel) => panel.id)).size === paneles.length, {
      message: "un panel repetido aparecería dos veces en la pantalla",
    }),
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
      { error: "acomodo inválido", detalles: parsed.error.issues.slice(0, 3) },
      { status: 422 },
    );
  }

  const profile = await prisma.profile.update({
    where: { userId: user.id },
    data: { summaryLayout: parsed.data.paneles },
    select: { summaryLayout: true },
  });

  return NextResponse.json({ paneles: profile.summaryLayout });
}
