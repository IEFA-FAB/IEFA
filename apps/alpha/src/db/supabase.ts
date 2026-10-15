import { createServiceRoleClient, SERVER_AUTH_OPTIONS } from "@iefa/supabase-kit"
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
	auth: SERVER_AUTH_OPTIONS,
	db: { schema: "alpha" },
})

/**
 * Cliente do schema `access_control` — a resolução de permissões do PBAC.
 *
 * Singleton porque a service role não carrega sessão de usuário: um client por processo
 * serve a todos os requests, e montar um por chamada de API (inclusive por turno de chat)
 * só refaria GoTrue, Realtime, PostgREST e Storage a cada vez. O vazamento de timer que
 * motivou o desenho já não existe: o kit desliga o auto-refresh (`SERVER_AUTH_OPTIONS`).
 */
export const accessControl = createServiceRoleClient({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SERVICE_ROLE_KEY, schema: "access_control" })

/**
 * Cliente do schema `core` — só leitura de `core.units`: o grafo de apoio que expande o
 * escopo por OM e o seletor de OM do envio. Singleton pelo mesmo motivo do de cima.
 */
export const core = createServiceRoleClient({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SERVICE_ROLE_KEY, schema: "core" })
