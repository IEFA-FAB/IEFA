import { createClient } from "@supabase/supabase-js";

/**
 * Cria um cliente Supabase leve para uso em helpers E2E.
 * Usa as variáveis de ambiente VITE_SISUB_SUPABASE_URL e
 * VITE_SISUB_SUPABASE_PUBLISHABLE_KEY (anon key).
 */
export function createE2ESupabaseClient() {
  const url = process.env.VITE_SISUB_SUPABASE_URL;
  const key = process.env.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars: VITE_SISUB_SUPABASE_URL and/or VITE_SISUB_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
