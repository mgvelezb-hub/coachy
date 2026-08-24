import "server-only";

import { notify } from "@/lib/coachy/notifications";
import { fromISODate, toISODate } from "@/lib/format";
import { loadObservatory } from "@/lib/observatory/data";
import type { EscalationSignal } from "@/lib/observatory/signals";
import { prisma } from "@/lib/prisma";

/**
 * Escalamiento: de señal a aviso (Fase 3).
 *
 * Con el autopiloto encendido esto **no bloquea nada**. La decisión del motor ya
 * se publicó; lo único que hace este módulo es dejarle un aviso al admin en la
 * misma tabla `notifications` que ya usan los recordatorios.
 *
 * La deduplicación va por `{atleta}:{señal}:{fecha ancla}`: correr Coachy dos
 * veces sobre el mismo check-in no genera dos avisos, y una señal que sigue
 * activa la semana siguiente sí genera uno nuevo (porque su ancla se movió).
 */

export interface EscalationResult {
  userId: string;
  signals: EscalationSignal[];
  created: number;
}

async function adminRecipients(): Promise<Array<{ id: string; email: string }>> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });
  return admins;
}

/**
 * Evalúa las señales de un atleta y materializa las que haya como avisos.
 *
 * Es el gancho que corre al final de `runCoachy`. Nunca lanza: un aviso que no
 * sale jamás debe tumbar el análisis del check-in, que es lo que importa.
 */
export async function runEscalationCheck(
  userId: string,
  today: Date = new Date(),
): Promise<EscalationResult> {
  const empty: EscalationResult = { userId, signals: [], created: 0 };

  try {
    const data = await loadObservatory(userId, today);
    if (!data || data.escalations.length === 0) return empty;

    const admins = await adminRecipients();
    if (admins.length === 0) return { userId, signals: data.escalations, created: 0 };

    let created = 0;

    for (const signal of data.escalations) {
      for (const admin of admins) {
        // El aviso es del admin, pero habla de otra persona: sin el `about` los
        // avisos de dos atletas el mismo día se pisarían entre sí.
        const notification = await notify({
          userId: admin.id,
          email: admin.email,
          kind: "ESCALAMIENTO",
          title: `${data.athlete.name}: ${signal.title}`,
          body: signal.detail,
          href: `/admin/atletas/${userId}`,
          about: `${userId}:${signal.id}`,
          on: signal.since ? fromISODate(signal.since) : today,
        });
        if (notification) created += 1;
      }
    }

    return { userId, signals: data.escalations, created };
  } catch (error) {
    console.error("[observatory] no se pudo evaluar el escalamiento de", userId, error);
    return empty;
  }
}

/**
 * Barrido de todos los atletas.
 *
 * Existe para la señal que ningún check-in dispara: "tres semanas sin check-in".
 * `runCoachy` solo corre cuando alguien manda datos, así que ese caso necesita
 * un cron. Hoy se invoca a mano; engancharlo a `/api/cron/wednesday` queda
 * pendiente.
 */
export async function runEscalationSweep(today: Date = new Date()): Promise<EscalationResult[]> {
  const athletes = await prisma.user.findMany({
    where: { role: "ATHLETE", profile: { isNot: null } },
    select: { id: true },
  });

  const results: EscalationResult[] = [];
  for (const athlete of athletes) {
    results.push(await runEscalationCheck(athlete.id, today));
  }
  return results;
}

export interface AdminEscalationNotice {
  id: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
}

/** Avisos de escalamiento sin leer, para la cabecera del observatorio. */
export async function pendingEscalations(
  adminId: string,
  take = 10,
): Promise<AdminEscalationNotice[]> {
  const rows = await prisma.notification.findMany({
    where: { userId: adminId, kind: "ESCALAMIENTO", readAt: null },
    orderBy: { createdAt: "desc" },
    take,
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    href: row.href,
    createdAt: toISODate(row.createdAt),
    readAt: row.readAt ? toISODate(row.readAt) : null,
  }));
}
