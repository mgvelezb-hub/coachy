"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isAdminEmail } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthState = { error: string | null };

const credentialsSchema = z.object({
  email: z.email("Escribe un correo válido"),
  password: z.string().min(8, "La contraseña necesita al menos 8 caracteres"),
});

const signUpSchema = credentialsSchema.extend({
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

function firstError(issues: z.core.$ZodIssue[]): string {
  return issues[0]?.message ?? "Datos inválidos";
}

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstError(parsed.error.issues) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return {
      error:
        error.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos"
          : error.message,
    };
  }

  revalidatePath("/", "layout");
  const next = String(formData.get("next") ?? "");
  if (next.startsWith("/") && !next.startsWith("//")) redirect(next);
  redirect(isAdminEmail(parsed.data.email) ? "/admin" : "/app");
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: firstError(parsed.error.issues) };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return { error: error.message };

  // Si el proyecto exige confirmar el correo, todavía no hay sesión.
  if (!data.session) {
    return { error: "Te mandamos un correo para confirmar tu cuenta. Ábrelo y vuelve aquí." };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
