import { sisubSchema } from "@iefa/database/drizzle/sisub"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { envServer } from "@/lib/env.server"

/**
 * Cliente Drizzle (Postgres direto via transaction pooler) para o query layer do
 * domínio `@iefa/sisub-domain`. Conecta pelo role do projeto → bypassa RLS; a
 * autorização segue inteiramente nos guards PBAC do domínio.
 *
 * Lazy singleton: a conexão `postgres` é um pool que persiste entre requests —
 * NÃO recriar por request (vazaria conexões e saturaria o pooler). O transaction
 * pooler (porta 6543) não suporta prepared statements → `prepare: false` obrigatório.
 *
 * Use em todas as server functions de dados (*.fn.ts) no lugar de
 * getSupabaseServerClient(). O client Supabase REST permanece apenas para auth.
 * Nunca importe em código client-side.
 */
let cached: ReturnType<typeof create> | undefined

function create() {
	if (!envServer.SISUB_DATABASE_URL) {
		throw new Error("SISUB_DATABASE_URL is not set — required by getDb() (Drizzle query layer). See apps/sisub/.env.schema.")
	}
	const client = postgres(envServer.SISUB_DATABASE_URL, {
		// Transaction pooler (6543) não suporta prepared statements.
		prepare: false,
		// Deadlines client-side (postgres-js, não enviados ao servidor → seguros com o
		// pooler). Sem eles, um pooler saturado deixa a AQUISIÇÃO de conexão pendurada
		// sem limite: no SSR isso trava o request além dos 60s do ALB → 504 + empilha
		// conexão → rajada de 502. `connect_timeout` corta a espera; `idle_timeout`/
		// `max_lifetime` reciclam conexões ociosas/velhas do pool.
		connect_timeout: 10, // s — falha rápido em vez de pendurar o SSR
		idle_timeout: 30, // s — devolve conexão ociosa ao pooler
		max_lifetime: 60 * 30, // s — recicla conexão a cada 30 min
		max: 10,
	})
	return drizzle(client, { schema: sisubSchema })
}

export function getDb() {
	if (!cached) cached = create()
	return cached
}
