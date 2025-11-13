import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SISUB_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SISUB_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: "sisub" },
    auth: {
        persistSession: true,
        storageKey: "auth_iefa",
    },
});

export default supabase;
