import { redirect } from "next/navigation";
import { cache } from "react";
import type { Profile, User } from "@prisma/client";

import { isAdminEmail } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SessionUser = User & { profile: Profile | null };

/**
 * Usuario autenticado + su fila en `public.users`, creándola si el trigger de
 * Supabase no alcanzó a hacerlo. El rol se recalcula desde `ADMIN_EMAILS` en
 * cada acceso: quitar un email de la lista degrada al usuario a ATHLETE.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser?.email) return null;

  const role = isAdminEmail(authUser.email) ? "ADMIN" : "ATHLETE";

  const user = await prisma.user.upsert({
    where: { id: authUser.id },
    create: { id: authUser.id, email: authUser.email, role },
    update: { email: authUser.email, role },
    include: { profile: true },
  });

  return user;
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
