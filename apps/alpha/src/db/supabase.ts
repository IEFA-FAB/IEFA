import { createServiceRoleClient } from "@iefa/supabase-kit"
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

/**
 * Cliente do schema `access_control` — a resolução de permissões do PBAC.
 *
 * Singleton pelo mesmo motivo do de cima, e não por economia: cada `createClient` do
 * supabase-js arma um `setInterval` de refresh do GoTrue que ninguém desarma. Criado
 * por request, o middleware de auth deixaria um timer vivo por chamada de API —
 * inclusive por turno de chat, onde a conexão fica aberta por minutos.
 */
export const accessControl = createServiceRoleClient({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SERVICE_ROLE_KEY, schema: "access_control" })
