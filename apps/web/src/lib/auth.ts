import { redirect } from "next/navigation";
import { cache } from "react";
import type { Profile, User } from "@prisma/client";

import { isAdminEmail } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SessionUser = User & { profile: Profile | null };

/**
 * Upsert de la fila en `public.users`, creándola si el trigger de Supabase no
 * alcanzó a hacerlo. El rol se recalcula desde `ADMIN_EMAILS` en cada acceso:
 * quitar un email de la lista degrada al usuario a ATHLETE.
 *
 * Compartida entre la sesión por cookies (`getSessionUser`) y la API pública
 * por Bearer (`@/lib/api/auth`): ambas llegan aquí con el mismo `authUser` de
 * Supabase, sea cual sea el transporte.
 */
export async function upsertSessionUser(authUser: {
  id: string;
  email: string;
}): Promise<SessionUser> {
  const role = isAdminEmail(authUser.email) ? "ADMIN" : "ATHLETE";

  return prisma.user.upsert({
    where: { id: authUser.id },
    create: { id: authUser.id, email: authUser.email, role },
    update: { email: authUser.email, role },
    include: { profile: true },
  });
}

/**
 * Usuario autenticado + su fila en `public.users` (sesión por cookies).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser?.email) return null;

  return upsertSessionUser({ id: authUser.id, email: authUser.email });
});

/** Exige sesión. Sin ella, manda a /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Exige sesión con onboarding terminado. */
export async function requireOnboardedUser(): Promise<SessionUser & { profile: Profile }> {
  const user = await requireUser();
  if (!user.profile?.onboardingCompletedAt) redirect("/onboarding");
  return user as SessionUser & { profile: Profile };
}

/** Exige rol ADMIN. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/app");
  return user;
}
