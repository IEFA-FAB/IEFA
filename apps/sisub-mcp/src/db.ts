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
 * O client Supabase (`getDataClient`/`getAuthClient` em supabase.ts) permanece
 * apenas para auth (JWT/API key) e para os poucos tools inline que ainda fazem
 * queries REST cruas em server.ts.
 */

import { sisubSchema } from "@iefa/database/drizzle/sisub"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

function requireEnv(key: string): string {
	const val = process.env[key]
	if (!val) throw new Error(`Variável de ambiente ausente: ${key}`)
	return val
}

let cached: ReturnType<typeof create> | undefined

function create() {
	const client = postgres(requireEnv("SISUB_DATABASE_URL"), { prepare: false })
	return drizzle(client, { schema: sisubSchema })
}

/** Cliente Drizzle compartilhado (`SisubDb`) para delegar às operations do domínio. */
export function getDb() {
	if (!cached) cached = create()
	return cached
}
