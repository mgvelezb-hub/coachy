import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { replyToText } from "@/lib/coachy/compose";
import type { CoachyReply } from "@/lib/coachy/types";
import { isoFromDateColumn } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * `GET /api/v1/decision` — la decisión publicada más reciente del atleta,
 * para la app nativa. Mismo patrón que el home (`src/app/app/page.tsx`):
 * solo lo publicado, nunca `replyJson` crudo (trae el texto redactado, no un
 * contrato de API estable).
 */

export const dynamic = "force-dynamic";

function replyFrom(value: Prisma.JsonValue | null): CoachyReply | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as unknown as CoachyReply;
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const decision = await prisma.decision.findFirst({
    where: { userId: user.id, publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    include: { checkIn: true },
  });

  if (!decision || !decision.publishedAt) {
    return NextResponse.json({ decision: null });
  }

  // Mismo alcance que el home: últimas 5 respuestas del atleta alcanzan para
  // saber si ya contestó la decisión vigente.
  const answered = await prisma.conversation.findMany({
    where: { userId: user.id, role: "ATHLETE" },
    orderBy: { date: "desc" },
    take: 5,
    select: { contextJson: true },
  });

  const alreadyAnswered = answered.some(
    (row) =>
      row.contextJson !== null &&
      typeof row.contextJson === "object" &&
      !Array.isArray(row.contextJson) &&
      (row.contextJson as Record<string, unknown>).decisionId === decision.id,
  );

  const reply = replyFrom(decision.replyJson);

  return NextResponse.json({
    decision: {
      id: decision.id,
      phase: decision.phase,
      kcal: decision.kcal,
      proteinG: decision.proteinG,
      carbsG: decision.carbsG,
      fatG: decision.fatG,
      checkInDate: isoFromDateColumn(decision.checkIn.date),
      publishedAt: decision.publishedAt.toISOString(),
      texto: reply ? replyToText(reply) : null,
      meta: reply?.meta ?? null,
      preguntas: reply?.preguntas ?? [],
      alreadyAnswered,
    },
  });
}
