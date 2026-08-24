"use server";

import { revalidatePath } from "next/cache";

import { requireOnboardedUser } from "@/lib/auth";
import { regenerateHealthToken } from "@/lib/health/db";

/**
 * Estrenar el token del Atajo de Salud.
 *
 * Se usa cuando el token se compartió sin querer (una captura de pantalla, un
 * atajo prestado). El atajo viejo deja de funcionar en ese instante y hay que
 * pegar el nuevo en el paso de "Obtener contenido de URL".
 *
 * No devuelve el token: la página lo vuelve a leer del servidor al recargar,
 * así que la credencial no viaja de más.
 */
export async function rotateHealthToken(): Promise<void> {
  const user = await requireOnboardedUser();
  await regenerateHealthToken(user.id);
  revalidatePath("/app");
}
