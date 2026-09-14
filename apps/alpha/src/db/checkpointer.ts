import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres"
import pg from "pg"
import { env } from "../env.ts"

/**
 * Checkpointer do LangGraph no schema `alpha`.
 *
 * O pool é construído aqui em vez de `fromConnString` por causa do TLS. O
 * `pg` 8.20 passou a tratar `sslmode=require` como `verify-full`, e a cadeia do
 * pooler do Supabase tem certificado auto-assinado — a conexão falha com
 * `SELF_SIGNED_CERT_IN_CHAIN` logo no `setup()`. Descoberto ao subir o serviço
 * pela primeira vez contra o banco real.
 *
 * `rejectUnauthorized: false` mantém a conexão **cifrada** e dispensa a
 * verificação da cadeia. A alternativa correta é embarcar o CA do Supabase e
 * verificar de fato; fica registrado como melhoria, não como pendência que
 * bloqueia — o host é o pooler gerenciado e a credencial é forte.
 *
 * Sem `schema`, o LangGraph criaria as próprias tabelas em `public`, que é
 * compartilhado com os demais apps do projeto.
 */
/**
 * O `pg` deixa os parâmetros da própria connection string sobrescreverem as
 * opções passadas por objeto, então não basta informar `ssl`: é preciso tirar o
 * `sslmode` da URL para que a configuração explícita valha.
 */
function poolConfig(databaseUrl: string): pg.PoolConfig {
	const url = new URL(databaseUrl)
	url.searchParams.delete("sslmode")

	return {
		connectionString: url.toString(),
		ssl: { rejectUnauthorized: false },
		// Limites que o `pg` não dá por padrão. Sem eles, um pooler que não responde deixa a
		// AQUISIÇÃO de conexão (`connectionTimeoutMillis` 0 = infinito) e a query pendurados
		// sem prazo — o mesmo mecanismo que prendeu uma task do sisub por cinco horas em
		// 2026-09-13. Aqui cada turno de chat passa por este pool (`graph.stream`/`getState`),
		// e o abort do SSE não devolve uma conexão cuja query nunca volta: dez travadas e
		// todo turno espera para sempre.
		max: 10,
		connectionTimeoutMillis: 5_000,
		// Checkpoint é leitura/escrita pequena por thread; 30 s é patologia, não carga. No
		// timeout o `pg` rejeita a query e a conexão sai do pool com erro.
		query_timeout: 30_000,
		idleTimeoutMillis: 30_000,
		keepAlive: true,
	}
}

const pool = new pg.Pool(poolConfig(env.DATABASE_URL))

// Sem listener, o `error` de uma conexão OCIOSA derrubada pelo servidor (pooler reiniciado,
// idle kill) é evento não tratado e mata o processo. O pool já descarta a conexão sozinho.
pool.on("error", (error) => {
	console.error(`[checkpointer] conexão ociosa do pool caiu: ${error.message}`)
})

export const checkpointer = new PostgresSaver(pool, undefined, { schema: "alpha" })

// Cria as tabelas oficiais do LangGraph se não existirem
await checkpointer.setup()
