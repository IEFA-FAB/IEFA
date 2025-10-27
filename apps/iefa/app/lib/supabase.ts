// supabase.app.ts (client do app)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_IEFA_SUPABASE_URL!;
const anon = import.meta.env.VITE_IEFA_SUPABASE_ANON_KEY!;

declare global {
  var __supabase_app__: SupabaseClient | undefined;
}

export const supabaseApp =
  globalThis.__supabase_app__ ??
  (globalThis.__supabase_app__ = createClient(url, anon, {
    auth: {
      persistSession: true,
      storageKey: "sb_iefa_app", 
    },
  }));
