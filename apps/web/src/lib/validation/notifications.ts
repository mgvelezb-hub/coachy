import { z } from "zod";

/**
 * `POST /api/v1/notifications/read` — qué avisos marcar como leídos.
 *
 * Los `id` de `Notification` son UUID (`@db.Uuid`), igual que `exerciseId` en
 * `@/lib/validation/training`. 1 a 50: una app que manda de golpe toda la
 * bandeja no debería poder pedir un `updateMany` sin tope.
 */
export const markNotificationsReadSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(50),
});

export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;
