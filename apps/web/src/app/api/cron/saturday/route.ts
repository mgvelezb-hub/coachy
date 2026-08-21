import { NextResponse } from "next/server";

import { guardCronRequest } from "@/lib/coachy/cron-auth";
import { notify } from "@/lib/coachy/notifications";
import { prisma } from "@/lib/prisma";

/**
 * Sábado por la noche: "mañana medidas y fotos, misma luz misma hora"
 * (metodología §5, spec 03 §2.5).
 *
 * Un solo mensaje, sin culpa, a quien ya terminó el onboarding.
 */

export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<NextResponse> {
  const guard = guardCronRequest(request);
  if (!guard.ok) return guard.response;

  const athletes = await prisma.user.findMany({
    where: { profile: { onboardingCompletedAt: { not: null } } },
    select: { id: true, email: true, profile: { select: { displayName: true } } },
  });

  let sent = 0;

  for (const athlete of athletes) {
    const notification = await notify({
      userId: athlete.id,
      email: athlete.email,
      kind: "RECORDATORIO_CHECKIN",
      title: "Mañana toca check-in",
      body:
        `${athlete.profile?.displayName ?? "Hey"}: mañana medidas y fotos, ` +
        "misma luz y misma hora que la semana pasada. Antes de las 12.",
      href: "/app/checkin",
    });
    if (notification) sent += 1;
  }

  return NextResponse.json({ atletas: athletes.length, avisos: sent });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
