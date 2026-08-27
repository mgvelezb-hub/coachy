import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { decimalToNumber, isoFromDateColumn } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * `GET /api/v1/checkins` — historial de check-ins del atleta autenticado,
 * del más reciente al más viejo. Para la gráfica de progreso de la app nativa.
 *
 * Nunca se manda `replyJson` completo (es el mensaje redactado de Coachy, no
 * un dato de check-in) ni check-ins de otro usuario: el filtro `userId` sale
 * siempre del Bearer, jamás de la query.
 */

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 52;
const MAX_LIMIT = 200;

/** Límite de la página: `DEFAULT_LIMIT` si no viene, acotado a `MAX_LIMIT`. */
function parseLimit(searchParams: URLSearchParams): number {
  const raw = searchParams.get("limit");
  if (!raw) return DEFAULT_LIMIT;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return DEFAULT_LIMIT;

  return Math.min(value, MAX_LIMIT);
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams);

  const checkIns = await prisma.checkIn.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: limit,
    include: {
      decision: {
        select: { phase: true, kcal: true, proteinG: true, carbsG: true, fatG: true, publishedAt: true },
      },
    },
  });

  return NextResponse.json({
    checkIns: checkIns.map((checkIn) => ({
      date: isoFromDateColumn(checkIn.date),
      waistCm: decimalToNumber(checkIn.waistCm),
      weightKg: decimalToNumber(checkIn.weightKg),
      legLeftCm: decimalToNumber(checkIn.legLeftCm),
      legRightCm: decimalToNumber(checkIn.legRightCm),
      armLeftCm: decimalToNumber(checkIn.armLeftCm),
      armRightCm: decimalToNumber(checkIn.armRightCm),
      decision: checkIn.decision?.publishedAt
        ? {
            phase: checkIn.decision.phase,
            kcal: checkIn.decision.kcal,
            proteinG: checkIn.decision.proteinG,
            carbsG: checkIn.decision.carbsG,
            fatG: checkIn.decision.fatG,
          }
        : null,
    })),
  });
}
