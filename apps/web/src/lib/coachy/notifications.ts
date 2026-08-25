import "server-only";

import type { Notification, NotificationKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Avisos de Coachy.
 *
 * Canal v1 = in-app. El correo es un extra: si `RESEND_API_KEY` no existe, el
 * aviso se crea igual y se ve dentro de la app. WhatsApp queda fuera de v1.
 *
 * Cada aviso lleva `dedupeKey` (`{kind}:{userId}:{fecha}`) para que un cron que
 * corra dos veces no mande dos veces lo mismo.
 */

export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  /** Fecha que hace única la notificación. Por defecto, hoy. */
  on?: Date;
  /**
   * Discriminante extra para la clave de deduplicación. Hace falta cuando el
   * mismo destinatario puede recibir varios avisos del mismo tipo el mismo día
   * (p. ej. el admin, un aviso por atleta).
   */
  about?: string;
  /** Correo del destinatario. Sin él no se intenta enviar nada. */
  email?: string | null;
}

function dedupeKeyFor(input: NotifyInput): string {
  const day = (input.on ?? new Date()).toISOString().slice(0, 10);
  const about = input.about ? `:${input.about}` : "";
  return `${input.kind}:${input.userId}${about}:${day}`;
}

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

const FROM = process.env.RESEND_FROM ?? "Holy Gains <coachy@resend.dev>";

/**
 * Envía el correo por la API REST de Resend. Se usa `fetch` a propósito: es una
 * sola llamada y no vale una dependencia más en el bundle del servidor.
 * Devuelve `false` sin lanzar: un correo que no sale nunca debe tumbar el cron.
 */
async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!resendConfigured()) return false;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Crea el aviso si no existía y, si se puede, lo manda por correo. */
export async function notify(input: NotifyInput): Promise<Notification | null> {
  const dedupeKey = dedupeKeyFor(input);

  const existing = await prisma.notification.findUnique({ where: { dedupeKey } });
  if (existing) return null;

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      dedupeKey,
    },
  });

  if (input.email) {
    const sent = await sendEmail(input.email, input.title, input.body);
    if (sent) {
      return prisma.notification.update({
        where: { id: notification.id },
        data: { emailedAt: new Date() },
      });
    }
  }

  return notification;
}

/** Avisos sin leer de un atleta, del más nuevo al más viejo. */
export async function unreadNotifications(userId: string): Promise<Notification[]> {
  return prisma.notification.findMany({
    where: { userId, readAt: null },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}
