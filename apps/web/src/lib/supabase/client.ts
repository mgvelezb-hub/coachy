"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

let cached: SupabaseClient | null = null;

/** Cliente de navegador. Perezoso: no se crea hasta que alguien lo pide. */
export function createClient(): SupabaseClient {
  if (!cached) {
    cached = createBrowserClient(supabaseUrl(), supabaseAnonKey());
  }
  return cached;
}
