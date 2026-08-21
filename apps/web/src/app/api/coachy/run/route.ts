import { NextResponse } from "next/server";

import { pendingCheckIns, runCoachy } from "@/lib/coachy";
import { guardCronRequest } from "@/lib/coachy/cron-auth";

/**
 * Cola de reintento de Coachy.
 *
 * El camino normal es `after()` dentro de la server action del check-in. Este
 * endpoint existe para lo que se cayó: un timeout de Claude, un deploy a media
 * ejecución, un check-in importado a mano. Procesa los check-ins sin decisión o
 * con decisión sin texto.
 *
 * Protegido con `CRON_SECRET`, igual que los crons.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: Request): Promise<NextResponse> {
  const guard = guardCronRequest(request);
  if (!guard.ok) return guard.response;

  const ids = await pendingCheckIns();
  const results: Array<{ checkInId: string; status: string; reason?: string }> = [];

  for (const checkInId of ids) {
    try {
      const result = await runCoachy(checkInId);
      results.push({ checkInId, status: result.status, reason: result.reason });
    } catch (error) {
      results.push({ checkInId, status: "error", reason: String(error) });
    }
  }

  return NextResponse.json({ procesados: results.length, resultados: results });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}

/** Vercel dispara los crons con GET; se acepta para poder encolarlo desde ahí. */
export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}
