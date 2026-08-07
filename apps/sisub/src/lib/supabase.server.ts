import type { Database } from "@iefa/database"
import { createServerClient } from "@supabase/ssr"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { getRequest, setCookie } from "@tanstack/react-start/server"

import { envServer } from "@/lib/env.server"
import { createTimeoutFetch } from "@/lib/timeout-fetch"

/**
 * Deadlines dos round-trips Supabase no servidor. Sem eles, um upstream degradado
 * (GoTrue/PostgREST/gateway) pendura o SSR até o ALB cortar em 60s → 504 + empilha
 * conexão → 502. Auth roda no caminho crítico de TODO TTFB protegido → deadline
 * mais curto; dados service-role toleram um pouco mais, mas ainda limitados.
 *
 * O orçamento total é o `idle_timeout` do ALB: 60 s. Uma rota protegida encadeia
 * auth + N chamadas de dados no mesmo request, então o deadline INDIVIDUAL precisa
 * caber várias vezes dentro de 60 s — senão duas chamadas lentas em sequência já
 * estouram o balanceador e o usuário recebe 504/502 em vez da página de erro que
 * o `__root` sabe renderizar. Com 5 s + 10 s cabem ~5 round-trips ruins antes de
 * chegar perto do corte; com os 8 s / 15 s anteriores, dois já custavam metade.
 * Medição que motivou o aperto: p95 de ~11,5 s no target group do sisub.
 */
const AUTH_FETCH_TIMEOUT_MS = 5_000
const DATA_FETCH_TIMEOUT_MS = 10_000
const authTimeoutFetch = createTimeoutFetch(AUTH_FETCH_TIMEOUT_MS)
const dataTimeoutFetch = createTimeoutFetch(DATA_FETCH_TIMEOUT_MS)

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
 * Factory de client Supabase service-role parametrizada por schema.
 * createClient (não SSR) — não lê cookies, sempre service role → bypass de RLS.
 * Use em server functions de dados (*.fn.ts). Nunca em código client-side.
 *
 * `createClient` é chamado sem generics (a sobrecarga nova do supabase-js não
 * aceita um schema genérico `S` em `db.schema`) e o retorno é tipado via cast
 * para `SupabaseClient<Database, S>` — runtime idêntico, tipo preciso no call site.
 */
export function getServerClient<S extends DbSchema>(schema: S): SupabaseClient<Database, S> {
	return createClient(envServer.VITE_SISUB_SUPABASE_URL, envServer.SISUB_SUPABASE_SECRET_KEY, {
		db: { schema },
		auth: { persistSession: false },
		global: { fetch: dataTimeoutFetch },
	}) as unknown as SupabaseClient<Database, S>
}

/** Helpers por domínio. */
export const getCoreClient = () => getServerClient("core")
export const getAccessControlClient = () => getServerClient("access_control")
export const getKitchenClient = () => getServerClient("kitchen")
export const getProcurementClient = () => getServerClient("procurement")
export const getFinanceClient = () => getServerClient("finance")
export const getComprasGovIntegrationClient = () => getServerClient("compras_gov_integration")

/**
 * Cliente Supabase com service role para operações de dados no schema `sisub`.
 *
 * Mantido como chamada DIRETA `createClient<Database, "sisub">` (não via
 * `getServerClient`): o tipo concreto preserva o narrowing de schema em `.from()`
 * nos call sites. Rotear pela factory genérica deixa o 3º generic do createClient
 * irredutível e quebra a inferência das tabelas (`policy_rule`, etc.).
 *
 * Use nas server functions de dados (*.fn.ts) que ainda leem do schema `sisub`.
 * Nunca importe em código client-side.
 */
export function getSupabaseServerClient() {
	return createClient<Database, "sisub">(envServer.VITE_SISUB_SUPABASE_URL, envServer.SISUB_SUPABASE_SECRET_KEY, {
		db: { schema: "sisub" },
		auth: { persistSession: false },
		global: { fetch: dataTimeoutFetch },
	})
}

/**
 * Cliente Supabase SSR para operações de autenticação.
 * Lê e escreve cookies de sessão do usuário — necessário para
 * auth.getUser() / auth.getSession() funcionar corretamente no servidor.
 *
 * Use APENAS em auth.fn.ts. Para queries de dados, use getSupabaseServerClient().
 */
export function getSupabaseAuthClient() {
	return createServerClient<Database, "sisub">(envServer.VITE_SISUB_SUPABASE_URL, envServer.SISUB_SUPABASE_SECRET_KEY, {
		db: { schema: "sisub" },
		global: { fetch: authTimeoutFetch },
		cookies: {
			getAll() {
				const request = getRequest()
				const cookieHeader = request?.headers.get("cookie")
				if (!cookieHeader) return []

				return cookieHeader.split(";").map((c) => {
					const [name, ...v] = c.split("=")
					return { name: name.trim(), value: v.join("=") }
				})
			},
			async setAll(cookies) {
				for (const { name, value, options } of cookies) {
					await setCookie(name, value, options)
				}
			},
		},
	})
}
