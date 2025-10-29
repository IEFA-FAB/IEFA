// supabase.app.ts (client do app)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_IEFA_SUPABASE_URL!;
const anon = import.meta.env.VITE_IEFA_SUPABASE_ANON_KEY!;

export const supabaseApp = createClient(url, anon, {
  db: { schema: "iefa" },
  auth: {
    persistSession: true,
    storageKey: "auth_iefa",
  },
});