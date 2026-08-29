import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { isoFromDateColumn, fromISODate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  CLINICAL_DISCLAIMER,
  checkInbodyCoherence,
  labResultSchema,
  outsideLabRange,
  type LabValue,
} from "@/lib/labs/schema";

/**
 * `GET /api/v1/labs` · `POST /api/v1/labs` — los estudios de la atleta.
 *
 * La app **guarda y grafica; no interpreta**. Por eso la respuesta trae, junto
 * a cada estudio, dos lecturas que no son diagnóstico:
 *
 * - `outsideRange`: qué valores caen fuera del rango que imprimió el propio
 *   laboratorio. Es leer el documento, no opinar sobre él.
 * - `coherence`: si un InBody se contradice a sí mismo, para no dejar que
 *   alimente el perfil.
 *
 * Y siempre, el mismo aviso: esto lo revisa un médico.
 */

export const dynamic = "force-dynamic";

function serialize(row: {
  id: string;
  kind: string;
  takenOn: Date;
  valuesJson: unknown;
  filePath: string | null;
  notes: string | null;
}) {
  const values = (Array.isArray(row.valuesJson) ? row.valuesJson : []) as LabValue[];

  return {
    id: row.id,
    kind: row.kind,
    takenOn: isoFromDateColumn(row.takenOn),
    values,
    filePath: row.filePath,
    notes: row.notes,
    outsideRange: outsideLabRange(values).map((value) => value.key),
    coherence: row.kind === "INBODY" ? checkInbodyCoherence(values) : { coherent: true, reason: null },
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const rows = await prisma.labResult.findMany({
    where: { userId: user.id },
    orderBy: { takenOn: "desc" },
    take: 50,
  });

  return NextResponse.json({
    labs: rows.map(serialize),
    disclaimer: CLINICAL_DISCLAIMER,
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

  const parsed = labResultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "estudio inválido", detalles: parsed.error.issues.slice(0, 3) },
      { status: 422 },
    );
  }

  const { kind, takenOn, values, filePath, notes } = parsed.data;

  // Recargar el mismo estudio (misma fecha y tipo) reemplaza al anterior: es
  // lo que pasa cuando alguien corrige un dato mal tecleado.
  const row = await prisma.labResult.upsert({
    where: { userId_kind_takenOn: { userId: user.id, kind, takenOn: fromISODate(takenOn) } },
    create: {
      userId: user.id,
      kind,
      takenOn: fromISODate(takenOn),
      valuesJson: values,
      filePath,
      notes,
    },
    update: { valuesJson: values, filePath, notes },
  });

  return NextResponse.json({ lab: serialize(row), disclaimer: CLINICAL_DISCLAIMER }, { status: 201 });
}
