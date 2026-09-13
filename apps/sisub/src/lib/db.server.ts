import { sisubSchema } from "@iefa/database/drizzle/sisub"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { guardWithDeadline, PendingSet } from "@/lib/db-deadline"
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

// `process.env` e não `import.meta.env`: o handler roda no Nitro. Ver env.server.ts.
const isDev = process.env.NODE_ENV !== "production"

/**
 * Prazo de cada query/transação do Drizzle. Folga sobre a mais lenta já medida em produção
 * (~17 s) e abaixo dos 60 s do ALB — passado disso o request já está perdido de qualquer
 * jeito, e o que importa é destravar o pool para os próximos. Ver `db-deadline.ts`.
 */
const QUERY_DEADLINE_MS = 45_000

/**
 * Pipeline mínimo. Com o pool cheio o postgres-js empilha a query nova numa conexão OCUPADA,
 * em round-robin; no default (100) uma conexão travada engolia as queries dos requests
 * seguintes — foi o 504 de 2026-09-13. Com 1, cada conexão aceita no máximo uma na fila e
 * passa a `full`; o resto espera conexão livre. NÃO baixar para 0: o `sent.length <
 * max_pipeline` do `execute` curto-circuita antes do `onexecute` que reserva a conexão do
 * `begin`, e toda transação falha com UNSAFE_TRANSACTION (medido contra o pooler).
 *
 * Fora do literal porque o `Options` tipado do postgres-js não declara `max_pipeline`,
 * embora o driver o leia (`src/index.js`).
 */
const PIPELINE = { max_pipeline: 1 }

/** Pendências de TODOS os pools (inclusive o que foi descartado) — lido pelo `/health`. */
const pending = new PendingSet()

/**
 * Operação pendente há mais que o prazo + folga significa que o guard não conseguiu soltá-la:
 * o processo está num estado de onde não sai sozinho, e o `/health` deve tirá-lo da rotação.
 */
export function isDbPoolWedged(): boolean {
	return pending.oldestPendingMs() > QUERY_DEADLINE_MS * 2
}

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
		...PIPELINE,
	})
	const guarded = guardWithDeadline(client, {
		deadlineMs: QUERY_DEADLINE_MS,
		tracker: pending,
		onExpire: (error) => {
			// biome-ignore lint/suspicious/noConsole: server-side — é o único rastro de que o pool foi recriado
			console.error(`[db] ${error.message} — recriando o pool do Drizzle`)
			// Só descarta se ainda é o pool em uso: várias queries do mesmo pool expiram juntas,
			// e a segunda não pode derrubar o pool novo que a primeira já criou.
			if (cached?.$client === guarded) cached = undefined
			// `timeout: 0` destrói as conexões na hora — esperar o fim das queries em curso é
			// esperar a travada, que não termina.
			void client.end({ timeout: 0 })
		},
	})
	return drizzle(guarded, { schema: sisubSchema })
}

export function getDb() {
	if (!cached) cached = create()
	return cached
}
