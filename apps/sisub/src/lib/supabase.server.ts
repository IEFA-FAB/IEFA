import type { Database } from "@iefa/database"
import type { PostgrestError } from "@supabase/supabase-js"
import { createServiceRoleClient, createStatelessAuthClient } from "@iefa/supabase-kit"
import { createSsrAuthClient } from "@iefa/supabase-kit/start"

import { envServer } from "@/lib/env.server"

/**
 * Schemas de domínio expostos via PostgREST que aceitam um service-role client.
 * Exclui a chave interna do tipo gerado (`__InternalSupabase`).
 *
 * Parte do split do schema `sisub` em schemas por domínio (core, kitchen,
 * procurement, finance, compras_gov_integration, ...). Conforme cada domínio é
 * migrado, os call sites supabase-js correspondentes passam a usar o client do
 * schema certo. A camada Drizzle (`getDb()`) acessa todos os schemas numa única
 * conexão e não depende desta factory.
 */
type DbSchema = Exclude<keyof Database, "__InternalSupabase">

/**
 * Client Supabase service-role do sisub, parametrizado por schema.
 * Use em server functions de dados (*.fn.ts). Nunca em código client-side.
 *
 * Os deadlines de fetch (auth 5 s / dados 10 s) vivem no @iefa/supabase-kit —
 * são a defesa contra o upstream degradado que virava 504/502 no ALB.
 */
export function getServerClient<S extends DbSchema>(schema: S) {
	return createServiceRoleClient({
		url: envServer.VITE_SISUB_SUPABASE_URL,
		secretKey: envServer.SISUB_SUPABASE_SECRET_KEY,
		schema,
	})
}

// biome-ignore lint/suspicious/noExplicitAny: porta frouxa das tabelas; ver `getLooseServerClient`
export type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

/**
 * Cliente SEM tipo das tabelas. Dívida, não padrão: sobrou em arquivos de estoque, compras e
 * finanças de quando essas tabelas não estavam nos tipos gerados. Elas estão hoje; tirar a porta
 * frouxa de um arquivo revela a nulidade que ela escondia (linha `string | null` indo para
 * parâmetro não nulo), e cada conversão trata isso. Código novo usa `getServerClient`.
 */
export function getLooseServerClient(schema: DbSchema): LooseClient {
	return getServerClient(schema) as unknown as LooseClient
}

type DbFunctions<S extends DbSchema> = Database[S]["Functions"]
type RpcName<S extends DbSchema> = keyof DbFunctions<S> & string
type RpcArgs<S extends DbSchema, F extends RpcName<S>> = DbFunctions<S>[F] extends { Args: infer A } ? A : never
type RpcReturns<S extends DbSchema, F extends RpcName<S>> = DbFunctions<S>[F] extends { Returns: infer R } ? R : never

/**
 * RPC tipada que aceita `null` explícito em parâmetro SEM default no SQL: o tipo gerado declara
 * todo parâmetro sem default como não nulo, e a função aceita nulo ali de propósito (ex.:
 * `inventory.register_leftover(p_reason)` sem descarte). Só os argumentos se alargam; o retorno
 * continua o do tipo gerado. Parâmetro com `DEFAULT NULL` não precisa disto: omita a chave
 * (`?? undefined`) e chame pelo cliente tipado.
 */
export function rpcWithNulls<S extends DbSchema, F extends RpcName<S>>(
	schema: S,
	fn: F,
	args: { [K in keyof RpcArgs<S, F>]: RpcArgs<S, F>[K] | null }
): PromiseLike<{ data: RpcReturns<S, F> | null; error: PostgrestError | null }> {
	const client = getServerClient(schema) as unknown as {
		rpc: (name: string, params: object) => PromiseLike<{ data: RpcReturns<S, F> | null; error: PostgrestError | null }>
	}
	return client.rpc(fn, args)
}

/** Helpers por domínio. */
export const getCoreClient = () => getServerClient("core")
export const getAccessControlClient = () => getServerClient("access_control")
export const getKitchenClient = () => getServerClient("kitchen")
export const getProcurementClient = () => getServerClient("procurement")
export const getFinanceClient = () => getServerClient("finance")
export const getComprasGovIntegrationClient = () => getServerClient("compras_gov_integration")

/**
 * Cliente service-role para as server functions que ainda leem do schema `sisub`.
 * Nunca importe em código client-side.
 */
export function getSupabaseServerClient() {
	return getServerClient("sisub")
}

/**
 * Cliente Supabase SSR para operações de autenticação.
 * Lê e escreve cookies de sessão do usuário — necessário para
 * auth.getUser() / auth.getSession() funcionarem no servidor.
 *
 * Use APENAS em auth.fn.ts. Para queries de dados, use getSupabaseServerClient().
 */
export function getSupabaseAuthClient() {
	// Publishable/anon key — NUNCA a service key: getUser() valida o JWT do cookie
	// no servidor Supabase de qualquer forma, e inicializar com a service role faria
	// qualquer query acidental por este client burlar a RLS. Guard: opengrep
	// `auth-client-secret-key` (.opengrep/rules/auth-client-key.yaml).
	return createSsrAuthClient({
		url: envServer.VITE_SISUB_SUPABASE_URL,
		key: envServer.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY,
		schema: "sisub",
	})
}

/**
 * Cliente Supabase de autenticação SEM estado — não lê nem escreve cookie.
 *
 * Existe para CONFERIR a senha da conta (reautenticação antes do cadastro do primeiro fator
 * TOTP) sem trocar a sessão de quem está na tela: pelo client SSR, o `signInWithPassword` da
 * conferência gravaria a sessão nova nos cookies do usuário. Use apenas em
 * `reauthentication.server.ts`; para identificar o usuário da request, é o
 * `getSupabaseAuthClient()`.
 */
export function getStatelessAuthClient() {
	// Publishable/anon — NUNCA a service key: este client serve para PROVAR uma credencial
	// de usuário, e a service role autenticaria qualquer coisa sem provar nada.
	return createStatelessAuthClient({
		url: envServer.VITE_SISUB_SUPABASE_URL,
		publishableKey: envServer.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY,
	})
}
