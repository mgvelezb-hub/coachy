/**
 * Acceso a variables de entorno con inicialización perezosa.
 *
 * Nada aquí se evalúa en tiempo de módulo: el build de Next debe pasar sin
 * credenciales de Supabase. El error solo aparece cuando algo intenta usar
 * de verdad un cliente que las necesita.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia apps/web/.env.example a apps/web/.env y rellénala.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function supabaseServiceRoleKey(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** True cuando hay credenciales suficientes para hablar con Supabase. */
export function hasSupabaseCredentials(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Emails con rol ADMIN, desde `ADMIN_EMAILS` (separados por coma). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}

export function visionEnabled(): boolean {
  return process.env.VISION_ENABLED === "true";
}

export function requireApproval(): boolean {
  return process.env.REQUIRE_APPROVAL !== "false";
}

export const PHOTO_BUCKET = "progress-photos";

/** Versión del texto de consentimiento aceptado en el onboarding. */
export const PHOTO_CONSENT_VERSION = "2026-08-21";
