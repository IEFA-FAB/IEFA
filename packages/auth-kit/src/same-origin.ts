/**
 * Guard de CSRF para rota de API que lê corpo JSON com a sessão do cookie.
 *
 * O `readBody` do h3 faz `JSON.parse` de qualquer content-type — inclusive
 * `text/plain`, que o navegador manda cross-site SEM preflight. O cookie do Supabase
 * é `SameSite=Lax`, e `*.iefa.com.br` inteiro é "same-site": uma página em outro
 * subdomínio conseguia disparar o chat (e as tools de escrita) com a sessão da vítima.
 *
 * Duas travas, e as duas precisam passar:
 * - `Content-Type: application/json` — força o preflight de CORS, que nenhum app libera.
 * - `Origin` (ou, na falta dele, `Referer`) com a MESMA origem do request. Navegador
 *   moderno manda `Origin` em todo POST; a ausência dos dois é recusada, porque só
 *   cliente fora do navegador chega sem eles — e esse não carrega o cookie da vítima.
 */
export type SameOriginCheck = { ok: true } | { ok: false; reason: string }

function originOf(value: string | null): string | null {
	if (!value) return null
	try {
		return new URL(value).origin
	} catch {
		return null
	}
}

/**
 * Host que o NAVEGADOR usou para chegar ao app. Atrás do ALB o host vem certo (o ALB
 * preserva o `Host`), mas o esquema chega `http`; por isso a comparação é pelo HOST.
 * `x-forwarded-host` fica de fora de propósito: o ALB repassa o valor que o CLIENTE mandou.
 */
function requestHost(headers: Headers, requestUrl: string): string | null {
	try {
		return (headers.get("host") || new URL(requestUrl).host).toLowerCase()
	} catch {
		return null
	}
}

/**
 * `true` quando `origin` (valor de `Origin`, ou a origem do `Referer`) aponta para o próprio
 * app. É também o matcher de origem do `createCsrfMiddleware` do TanStack Start, cuja
 * comparação padrão (`Origin === new URL(request.url).origin`) recusaria todo request
 * legítimo atrás do ALB, onde `request.url` chega com `http:`.
 */
export function isRequestOrigin(origin: string | null | undefined, headers: Headers, requestUrl: string): boolean {
	const source = originOf(origin ?? null)
	const expected = requestHost(headers, requestUrl)
	return source !== null && expected !== null && new URL(source).host.toLowerCase() === expected
}

export function checkSameOriginJsonRequest(headers: Headers, requestUrl: string): SameOriginCheck {
	const contentType = headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
	if (contentType !== "application/json") {
		return { ok: false, reason: "Content-Type precisa ser application/json" }
	}

	const source = originOf(headers.get("origin")) ?? originOf(headers.get("referer"))
	if (!source) return { ok: false, reason: "Origem ausente" }
	if (!isRequestOrigin(source, headers, requestUrl)) return { ok: false, reason: "Origem diferente do app" }
	return { ok: true }
}
