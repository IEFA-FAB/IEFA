/**
 * @module cookie-session
 * Usuário da sessão a partir do header `Cookie`, SEM renovar a sessão.
 *
 * Existe para as rotas Nitro (`routes/api/**`), que rodam fora do contexto de request do
 * TanStack Start e não têm como regravar cookie (um endpoint SSE já abriu o stream).
 *
 * ## Por que não `createCookieAuthClient(...).auth.getUser()`
 *
 * `getUser()` sem argumento passa por `_useSession` → `__loadSession`, e com o access token a
 * menos de 90 s de vencer (ou vencido) o auth-js chama o refresh com o refresh token do cookie.
 * O GoTrue ROTACIONA o refresh token; como o `setAll` daquele client é no-op, o navegador segue
 * com o antigo, e o próximo refresh dele (fora da janela de reuso) é lido como reuso: o GoTrue
 * revoga a família de tokens e o usuário é deslogado. `getClaims()` sem argumento tem o mesmo
 * caminho (`getSession()`).
 *
 * Aqui o access token sai do cookie direto e vai para `getUser(jwt)`, que só faz
 * `GET /auth/v1/user` com ele: valida assinatura, expiração e se a sessão ainda existe no
 * GoTrue (logout e ban valem na hora, o que `getClaims(jwt)` com chave assimétrica não
 * garantiria até o `exp`). Token vencido é 401, e o navegador renova a sessão pelo próprio
 * client, que é quem pode gravar o cookie novo.
 */
import { combineChunks, stringFromBase64URL } from "@supabase/ssr"
import { type AuthError, isAuthApiError, isAuthSessionMissingError, type User } from "@supabase/supabase-js"

import { parseCookieHeader } from "./cookie-auth-client.ts"
import { createStatelessAuthClient } from "./stateless-auth-client.ts"

/** Prefixo do valor codificado pelo `@supabase/ssr` (`cookieEncoding: "base64url"`, o default). */
const BASE64_PREFIX = "base64-"

export type CookieSessionOptions = {
	/** URL do projeto Supabase (`VITE_<APP>_SUPABASE_URL`). */
	url: string
	/**
	 * Chave publishable/anon (`VITE_<APP>_SUPABASE_PUBLISHABLE_KEY`). NUNCA a service role: o
	 * client que valida o token não pode ser um que burla a RLS se alguém o reaproveitar.
	 */
	publishableKey: string
	/** Conteúdo bruto do header `Cookie` da request (ausente ⇒ sem sessão). */
	cookieHeader: string | undefined
	/** Override do `fetch`. Default: deadline de auth (5 s). */
	fetch?: typeof fetch
}

/**
 * - `401`: sem sessão, ou token que o GoTrue recusou (vencido, adulterado, sessão encerrada).
 * - `503`: o GoTrue não respondeu (deadline, rede, 5xx). Quem tem sessão válida não pode
 *   receber 401 por isso: o cliente trata 401 como sessão perdida.
 */
export type CookieSessionResult = { ok: true; user: User } | { ok: false; status: 401 | 503; reason: string }

/** Nome do cookie de sessão que o `@supabase/ssr` grava sem `cookieOptions.name`: `sb-<ref>-auth-token`. */
export function sessionCookieName(url: string): string {
	return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`
}

function decodeCookieValue(value: string): string | null {
	try {
		return value.startsWith(BASE64_PREFIX) ? stringFromBase64URL(value.slice(BASE64_PREFIX.length)) : decodeURIComponent(value)
	} catch {
		return null
	}
}

/**
 * Access token da sessão gravada no cookie (juntando os chunks `.0`, `.1`…), sem validar nada.
 * `null` sem cookie ou com valor ilegível — chunks de gerações diferentes produzem JSON
 * inválido, e isso é "sem sessão", não erro.
 */
export async function readSessionAccessToken(url: string, cookieHeader: string | undefined): Promise<string | null> {
	const cookies = parseCookieHeader(cookieHeader)
	const raw = await combineChunks(sessionCookieName(url), (name) => cookies.find((cookie) => cookie.name === name)?.value ?? null)
	if (!raw) return null

	const decoded = decodeCookieValue(raw)
	if (!decoded) return null
	try {
		const session: unknown = JSON.parse(decoded)
		const token = (session as { access_token?: unknown } | null)?.access_token
		return typeof token === "string" && token !== "" ? token : null
	} catch {
		return null
	}
}

/**
 * Só a recusa do próprio GoTrue diz que a sessão não vale: 4xx (JWT vencido ou adulterado) ou
 * `session_not_found` (logout, usuário removido). Falha de transporte (`AuthRetryableFetchError`:
 * deadline, rede, 5xx) e resposta ilegível (`AuthUnknownError`) não dizem nada sobre a sessão.
 */
function isSessionRejected(error: AuthError): boolean {
	return isAuthSessionMissingError(error) || (isAuthApiError(error) && error.status < 500)
}

/** Usuário da sessão do cookie, validado no GoTrue sem renovar a sessão. Nunca lança. */
export async function resolveCookieSessionUser({ url, publishableKey, cookieHeader, fetch }: CookieSessionOptions): Promise<CookieSessionResult> {
	const accessToken = await readSessionAccessToken(url, cookieHeader)
	if (!accessToken) return { ok: false, status: 401, reason: "sem sessão" }

	try {
		const auth = createStatelessAuthClient({ url, publishableKey, fetch })
		const {
			data: { user },
			error,
		} = await auth.auth.getUser(accessToken)
		if (user && !error) return { ok: true, user }
		if (error && isSessionRejected(error)) return { ok: false, status: 401, reason: error.message }
		return { ok: false, status: 503, reason: error?.message ?? "GoTrue sem usuário" }
	} catch (error) {
		return { ok: false, status: 503, reason: error instanceof Error ? error.message : String(error) }
	}
}
