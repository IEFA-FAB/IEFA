/**
 * Cliente Drizzle (Postgres direto via transaction pooler) para o query layer do
 * domínio `@iefa/sisub-domain`. As operations do domínio migraram de PostgREST
 * para Drizzle e exigem um `SisubDb` — não mais o client Supabase REST.
 *
 * Conecta pelo role do projeto → bypassa RLS; a autorização segue inteiramente
 * nos guards PBAC do domínio (a permissão PBAC é resolvida antes via Supabase).
 *
 * Lazy singleton: a conexão `postgres` é um pool que persiste entre chamadas —
 * NÃO recriar por request (vazaria conexões e saturaria o pooler). O transaction
 * pooler (porta 6543) não suporta prepared statements → `prepare: false` obrigatório.
 *
 * O pool é o mesmo `createResilientPostgres` do sisub: prazo por operação, pipeline 1 e
 * recriação quando uma conexão trava. Antes daqui este app tinha exatamente a configuração
 * que deixou uma task do sisub devolvendo 504 por cinco horas em 2026-09-13.
 *
 * O client Supabase (`getDataClient`/`getAuthClient` em supabase.ts) permanece
 * apenas para auth (JWT/API key) e para os poucos tools inline que ainda fazem
 * queries REST cruas em server.ts.
 */

import { sisubSchema } from "@iefa/database/drizzle/sisub"
import { createResilientPostgres, type ResilientPostgres } from "@iefa/database/postgres-pool"
import { drizzle } from "drizzle-orm/postgres-js"

function requireEnv(key: string): string {
	const val = process.env[key]
	if (!val) throw new Error(`Variável de ambiente ausente: ${key}`)
	return val
}

let cached: { db: ReturnType<typeof createDb>; pool: ResilientPostgres } | undefined

function createDb(pool: ResilientPostgres) {
	return drizzle(pool.sql, { schema: sisubSchema })
}

function create() {
	const pool = createResilientPostgres(requireEnv("SISUB_DATABASE_URL"), {
		connection: { prepare: false, connect_timeout: 5, idle_timeout: 30, max_lifetime: 60 * 30, max: 10 },
		onReset: (error) => process.stderr.write(`[sisub-mcp] ${error.message} — recriando o pool do Drizzle\n`),
	})
	return { pool, db: createDb(pool) }
}

/** Cliente Drizzle compartilhado (`SisubDb`) para delegar às operations do domínio. */
export function getDb() {
	if (!cached) cached = create()
	return cached.db
}

/** Pool preso mesmo depois do prazo — o `/health` reprova para o ECS trocar a task. */
export function isDbPoolWedged(): boolean {
	return cached?.pool.isWedged() ?? false
}
