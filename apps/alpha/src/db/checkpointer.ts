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

	return { connectionString: url.toString(), ssl: { rejectUnauthorized: false } }
}

const pool = new pg.Pool(poolConfig(env.DATABASE_URL))

export const checkpointer = new PostgresSaver(pool, undefined, { schema: "alpha" })

// Cria as tabelas oficiais do LangGraph se não existirem
await checkpointer.setup()
