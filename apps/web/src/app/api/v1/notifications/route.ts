import { NextResponse } from "next/server";

import { apiUser, unauthorized } from "@/lib/api/auth";
import { unreadNotifications } from "@/lib/coachy/notifications";

/**
 * `GET /api/v1/notifications` — avisos sin leer del atleta autenticado, para
 * la app nativa. Mismos 5 más recientes que ve el home web.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await apiUser(request);
  if (!user) return unauthorized();

  const notifications = await unreadNotifications(user.id);

  return NextResponse.json({
    notificaciones: notifications.map((notification) => ({
      id: notification.id,
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      createdAt: notification.createdAt.toISOString(),
    })),
  });
}
