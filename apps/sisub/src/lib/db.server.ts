import { sisubSchema } from "@iefa/database/drizzle/sisub"
import { createResilientPostgres, type ResilientPostgres } from "@iefa/database/postgres-pool"
import { drizzle } from "drizzle-orm/postgres-js"

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
 * O pool vem de `createResilientPostgres`: prazo por query (45 s) e por transação (55 s)
 * contado do início da execução, e recriação automática quando uma conexão trava — o 504
 * de cinco horas de 2026-09-13. O handle é estável: um `db` capturado antes
 * de um reset continua valendo no pool novo.
 *
 * Use em todas as server functions de dados (*.fn.ts) no lugar de
 * getSupabaseServerClient(). O client Supabase REST permanece apenas para auth.
 * Nunca importe em código client-side.
 */
let cached: { db: ReturnType<typeof createDb>; pool: ResilientPostgres } | undefined

// `process.env` e não `import.meta.env`: o handler roda no Nitro. Ver env.server.ts.
const isDev = process.env.NODE_ENV !== "production"

function createDb(pool: ResilientPostgres) {
	return drizzle(pool.sql, { schema: sisubSchema })
}

function create() {
	if (!envServer.SISUB_DATABASE_URL) {
		throw new Error("SISUB_DATABASE_URL is not set — required by getDb() (Drizzle query layer). See apps/sisub/.env.schema.")
	}
	const pool = createResilientPostgres(envServer.SISUB_DATABASE_URL, {
		connection: {
			// Transaction pooler (6543) não suporta prepared statements.
			prepare: false,
			// Deadlines client-side (postgres-js, não enviados ao servidor → seguros com o
			// pooler). Sem eles, um pooler saturado deixa a AQUISIÇÃO de conexão pendurada
			// sem limite: no SSR isso trava o request além dos 60s do ALB → 504 + empilha
			// conexão → rajada de 502. `connect_timeout` corta a espera; `idle_timeout`/
			// `max_lifetime` reciclam conexões ociosas/velhas do pool.
			// 5 s: adquirir conexão é o passo mais barato do request, então esperar mais
			// que isso só consome o orçamento de 60 s do ALB antes da query sequer rodar.
			// Em dev o orçamento do ALB não existe e o raciocínio se inverte: o `connect_timeout`
			// do postgres-js é um timer no event loop, e o vite bloqueia o loop por dezenas de
			// segundos ao transformar uma rota fria. Com 5 s, a primeira navegação de cada rota
			// pesada derruba TODAS as queries do request com CONNECT_TIMEOUT — sem que haja nada
			// errado com o banco. 30 s cobre a transformação e continua falhando em vez de pendurar.
			connect_timeout: isDev ? 30 : 5, // s — falha rápido em vez de pendurar o SSR
			idle_timeout: 30, // s — devolve conexão ociosa ao pooler
			max_lifetime: 60 * 30, // s — recicla conexão a cada 30 min
			max: 10,
		},
		onReset: (error) => {
			// biome-ignore lint/suspicious/noConsole: server-side — é o único rastro de que o pool foi recriado
			console.error(`[db] ${error.message} — recriando o pool do Drizzle`)
		},
	})
	return { pool, db: createDb(pool) }
}

export function getDb() {
	if (!cached) cached = create()
	return cached.db
}

/**
 * Operação presa mesmo depois do prazo (ou fila parada além do teto): o processo está num
 * estado de onde não sai sozinho, e o `/health` deve tirá-lo da rotação.
 */
export function isDbPoolWedged(): boolean {
	return cached?.pool.isWedged() ?? false
}
