import { NextResponse } from "next/server";
import { runEscalationSweep } from "@/lib/observatory/escalation";

import { guardCronRequest } from "@/lib/coachy/cron-auth";
import { notify } from "@/lib/coachy/notifications";
import { formatShortDate, sundayOf } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * Miércoles a mediodía (spec 03 §2.5):
 *
 *  1. Si no llegó el check-in del domingo → un solo "¿cómo vamos?", sin culpa.
 *  2. Si van 2 semanas sin check-in → aviso al admin, no al atleta. La señal de
 *     abandono la trabaja una persona, no un recordatorio más.
 */

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

async function handle(request: Request): Promise<NextResponse> {
  const guard = guardCronRequest(request);
  if (!guard.ok) return guard.response;

  const thisSunday = sundayOf(new Date());
  const twoWeeksAgo = new Date(thisSunday.getTime() - 14 * DAY_MS);

  const athletes = await prisma.user.findMany({
    where: { role: "ATHLETE", profile: { onboardingCompletedAt: { not: null } } },
    select: {
      id: true,
      email: true,
      profile: { select: { displayName: true } },
      checkIns: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
    },
  });

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });

  // Barrido de señales de riesgo para el observatorio (dedupe interno).
  const escalations = await runEscalationSweep(new Date()).catch(() => []);

  let reminders = 0;
  const abandoned: string[] = [];

  for (const athlete of athletes) {
    const last = athlete.checkIns[0]?.date ?? null;
    const missedThisWeek = !last || last < thisSunday;
    if (!missedThisWeek) continue;

    const notification = await notify({
      userId: athlete.id,
      email: athlete.email,
      kind: "CHECKIN_PENDIENTE",
      title: "¿Cómo vamos?",
      body: "No me llegó tu check-in del domingo. Cuando puedas me mandas medidas y fotos.",
      href: "/app/checkin",
    });
    if (notification) reminders += 1;

    if (!last || last < twoWeeksAgo) {
      abandoned.push(athlete.profile?.displayName ?? athlete.email);

      for (const admin of admins) {
        await notify({
          userId: admin.id,
          email: admin.email,
          kind: "ALERTA_ABANDONO",
          about: athlete.id,
          title: "Dos semanas sin check-in",
          body:
            `${athlete.profile?.displayName ?? athlete.email} no manda check-in desde ` +
            `${last ? formatShortDate(last) : "nunca"}. Vale la pena escribirle.`,
          href: "/admin",
        });
      }
    }
  }

  return NextResponse.json({ recordatorios: reminders, sinCheckInDosSemanas: abandoned.length });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
