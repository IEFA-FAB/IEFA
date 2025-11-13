// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.API_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.API_SUPABASE_ANON_KEY!;

// auth.persistSession false em ambiente server
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "sisub" },
    auth: { persistSession: false },
});

export default supabase;
