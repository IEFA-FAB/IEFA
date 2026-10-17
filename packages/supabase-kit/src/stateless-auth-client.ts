/**
 * @module stateless-auth-client
 * Client de auth SEM estado: não lê cookie, não escreve cookie, não guarda sessão.
 *
 * ## Por que existe
 *
 * Há uma operação de auth que precisa VERIFICAR uma credencial sem TROCAR a sessão de quem
 * está na tela: a reautenticação por senha exigida antes do cadastro do primeiro fator TOTP
 * (design.md D14 do `sisub-mfa-step-up`). A conferência é um `signInWithPassword`, e feita
 * pelo client SSR (`createSsrAuthClient`) ela gravaria a sessão NOVA nos cookies do usuário —
 * trocando, no meio de um fluxo de segurança, a sessão que o app acabou de autorizar.
 *
 * `auth.reauthenticate()` do supabase-js NÃO serve para isso: ele envia um nonce por e-mail
 * (é a etapa da "Secure password change"), não confere senha nenhuma.
 *
 * Com `persistSession: false` a sessão descartável vive só na memória deste client, que morre
 * com o request. Ainda assim quem chama DEVE revogá-la com `signOut({ scope: "local" })` — o
 * default de `signOut()` é escopo GLOBAL e derrubaria todas as sessões do titular, que é o
 * oposto do que uma conferência de senha pode causar.
 *
 * Sozinho, não decide QUEM é o usuário da request: ele não enxerga os cookies. Quem responde
 * isso é `createSsrAuthClient` (server fn do Start) ou `resolveCookieSessionUser` (rota Nitro),
 * que usa este client para validar, com `getUser(jwt)`, o token que ele mesmo tirou do cookie.
 * O outro uso de identificação é o token que já chega explícito, sem cookie (`Authorization:
 * Bearer` de um cliente MCP, no sisub-mcp): aí quem chama passa o JWT a `getUser(jwt)` e trata
 * falha de transporte (`AuthRetryableFetchError`) como indisponibilidade, não como token ruim.
 */
import { createClient } from "@supabase/supabase-js"

import { SERVER_AUTH_OPTIONS } from "./server-options.ts"
import { authTimeoutFetch } from "./timeout-fetch.ts"

export type StatelessAuthClientOptions = {
	/** URL do projeto Supabase (`VITE_<APP>_SUPABASE_URL`). */
	url: string
	/**
	 * Chave publishable/anon (`VITE_<APP>_SUPABASE_PUBLISHABLE_KEY`).
	 *
	 * NUNCA a service role: este client serve para provar uma credencial de usuário, e a
	 * service role autenticaria qualquer coisa sem provar nada.
	 */
	publishableKey: string
	/** Override do `fetch`. Default: deadline de auth (5 s). */
	fetch?: typeof fetch
}

/**
 * Client Supabase de autenticação sem persistência, para conferir credencial no servidor.
 *
 * Use só em módulos de servidor (`*.server.ts`, `src/server/**`).
 */
export function createStatelessAuthClient({ url, publishableKey, fetch }: StatelessAuthClientOptions) {
	return createClient(url, publishableKey, {
		auth: SERVER_AUTH_OPTIONS,
		global: { fetch: fetch ?? authTimeoutFetch },
	})
}
