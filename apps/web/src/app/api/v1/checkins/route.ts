import { NextResponse, after } from "next/server";
import type { ZodError } from "zod";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { runCoachy } from "@/lib/coachy";
import { persistCheckIn } from "@/lib/checkin-write";
import { fromISODate, decimalToNumber, isoFromDateColumn } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { checkInSchema, coerceCheckInPayload } from "@/lib/validation/checkin";

/**
 * `GET /api/v1/checkins` — historial de check-ins del atleta autenticado,
 * del más reciente al más viejo. Para la gráfica de progreso de la app nativa.
 *
 * Nunca se manda `replyJson` completo (es el mensaje redactado de Coachy, no
 * un dato de check-in) ni check-ins de otro usuario: el filtro `userId` sale
 * siempre del Bearer, jamás de la query.
 *
 * `POST /api/v1/checkins` — guarda el check-in semanal desde la app nativa.
 * Mismo contrato que la server action de la web (`checkInSchema` +
 * `coerceCheckInPayload` + `persistCheckIn` + `runCoachy` en segundo plano),
 * pero sin fotos (van en `POST /api/v1/checkins/[id]/photos`, porque la app
 * nativa las sube directo a Storage) y sin `revalidatePath` (el cliente
 * nativo no tiene RSC cache que invalidar).
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

/** `parsed.error.issues` → `{ "campo.anidado": "mensaje" }`, un mensaje por campo. */
function fieldErrorsOf(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  if (!user.profile?.onboardingCompletedAt) {
    return NextResponse.json({ error: "onboarding incompleto" }, { status: 403 });
  }
  const profile = user.profile;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 });
  }

  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const parsed = checkInSchema.safeParse(coerceCheckInPayload(raw));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "datos inválidos", detalles: fieldErrorsOf(parsed.error) },
      { status: 422 },
    );
  }

  const checkIn = await persistCheckIn(user.id, parsed.data);

  // "Esta semana empezó mi periodo" reancla `cycle_last_period_start`, igual
  // que la web (`src/app/app/checkin/actions.ts#syncCycle`). No se reusa
  // `syncCycle` a propósito: recibe un `FormData` (lee `cycleSettingsPresent`,
  // `cycleLastPeriodStart`, etc. del formulario web) y aquí solo hay un JSON
  // con el check-in — reanclar es la única pieza de esa función que aplica
  // a un payload que no trae ajustes de ciclo, así que se replica suelta.
  if (parsed.data.periodStarted === true && profile.cycleTrackingEnabled) {
    await prisma.profile.update({
      where: { userId: user.id },
      data: { cycleLastPeriodStart: fromISODate(parsed.data.date) },
    });
  }

  // Mismo patrón que la server action: Coachy corre después de contestarle al
  // cliente, y si truena la cola de `/api/coachy/run` lo reintenta. Sin
  // `revalidatePath` — el cliente nativo no tiene RSC cache.
  after(async () => {
    try {
      await runCoachy(checkIn.id);
    } catch (error) {
      console.error("[coachy] falló el análisis del check-in (api)", checkIn.id, error);
    }
  });

  return NextResponse.json(
    { id: checkIn.id, date: isoFromDateColumn(checkIn.date) },
    { status: 201 },
  );
}
