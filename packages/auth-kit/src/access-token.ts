import type { SupabaseClient } from "@supabase/supabase-js"

/** Teto da leitura do token: o `getSession()` pode renovar a sessão contra o GoTrue. */
export const ACCESS_TOKEN_READ_TIMEOUT_MS = 10_000

/**
 * Access token da sessão corrente, lido do client do navegador na hora da chamada (o
 * `getSession()` renova o token vencido). `undefined` sem sessão, no servidor, ou se a leitura
 * passar de `timeoutMs`: o client do navegador não tem deadline de fetch, e uma renovação
 * pendurada prenderia a chamada autenticada sem prazo. Sem token, o serviço responde 401 e a
 * tela mostra o erro, em vez de esperar para sempre.
 *
 * Nunca guarde o retorno em estado que o SSR serializa (React Query, contexto do router).
 */
export async function readAccessToken(
	// biome-ignore lint/suspicious/noExplicitAny: o kit é agnóstico ao Database/schema da app; só usa `.auth`.
	client: SupabaseClient<any, any>,
	timeoutMs: number = ACCESS_TOKEN_READ_TIMEOUT_MS
): Promise<string | undefined> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<undefined>((resolve) => {
		timer = setTimeout(() => resolve(undefined), timeoutMs)
	})
	try {
		return await Promise.race([client.auth.getSession().then(({ data }) => data.session?.access_token), timeout])
	} finally {
		clearTimeout(timer)
	}
}
