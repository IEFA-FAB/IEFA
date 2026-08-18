import { createClient } from "@supabase/supabase-js"
import { env } from "../env.ts"

/**
 * Cliente Supabase do alpha.
 *
 * O Projeto α vive no schema `alpha` do projeto Supabase principal do IEFA —
 * migrations em `packages/database/supabase/migrations/`. Sem `db.schema` o
 * PostgREST resolveria as tabelas em `public`.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false },
	db: { schema: "alpha" },
})
