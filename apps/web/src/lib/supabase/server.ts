import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";

/**
 * Cliente ligado a la sesión del usuario (cookies). Respeta RLS.
 * Se crea por petición; nunca se cachea entre usuarios.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component: el middleware ya refresca la sesión, se ignora.
        }
      },
    },
  });
}

/**
 * Cliente con service role. Salta RLS — úsalo solo en código de servidor y
 * solo cuando la operación ya validó a quién pertenece el dato.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  return createServerClient(supabaseUrl(), supabaseServiceRoleKey(), {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // Sin sesión: este cliente nunca escribe cookies.
      },
    },
  });
}
