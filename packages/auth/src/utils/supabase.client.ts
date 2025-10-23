// packages/auth/src/utils/supabase.client.ts
import { createClient } from "@supabase/supabase-js";

declare global {
  interface ImportMetaEnv {
    readonly VITE_AUTH_SUPABASE_URL: string;
    readonly VITE_AUTH_SUPABASE_ANON_KEY: string;
    // add other VITE_... variables here as needed
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

const supabaseUrl = import.meta.env.VITE_AUTH_SUPABASE_URL!;
const supabaseKey = import.meta.env.VITE_AUTH_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true,
    flowType: "pkce",
  },
});

export default supabase;
