/**
 * Política de origem do transporte HTTP — separada de `index.ts` para ser testável sem subir
 * o servidor.
 *
 * A spec do MCP (Streamable HTTP) manda o servidor validar o `Origin` de toda conexão: sem
 * isso, uma página qualquer aberta no navegador de quem tem o servidor ao alcance (DNS
 * rebinding, ou CSRF com a credencial que o navegador já tem) fala com o endpoint. O
 * `Access-Control-Allow-Origin: *` de antes liberava exatamente esse caso.
 *
 * Regras:
 *   - Sem `Origin`: cliente de servidor ou CLI (Claude.ai do lado do servidor, Cursor, Claude
 *     Desktop, scripts). Passa, e sem cabeçalho CORS nenhum: quem não é navegador não lê CORS.
 *   - `Origin` na lista de `SISUB_MCP_ALLOWED_ORIGINS`: passa, com o CORS dessa origem (nunca `*`).
 *   - `Origin` fora da lista (inclusive `null`, de iframe sandbox ou `file://`): 403, sem
 *     `Access-Control-Allow-Origin` — preflight e requisição.
 *
 * `SISUB_MCP_ALLOWED_ORIGINS`: lista separada por vírgula de origens exatas
 * (`https://inspector.exemplo.com.br,http://localhost:6274`). Vazia ou ausente = nenhuma
 * origem de navegador. `*` é recusado na partida: reabriria o buraco que esta política fecha.
 */

/** Nome da variável de ambiente com as origens de navegador permitidas. */
export const ALLOWED_ORIGINS_ENV = "SISUB_MCP_ALLOWED_ORIGINS"

/** Cabeçalhos que o cliente MCP de navegador manda (a credencial vai em `x-api-key` ou `Authorization`). */
const ALLOWED_REQUEST_HEADERS = "Content-Type, Authorization, x-api-key, mcp-session-id, mcp-protocol-version, last-event-id"

/** O navegador só deixa o script ler `mcp-session-id` da resposta se ele estiver exposto. */
const EXPOSED_RESPONSE_HEADERS = "mcp-session-id"

/** Origem serializada (`esquema://host[:porta]`) ou `null` se o valor não é uma origem http(s). */
function normalizeOrigin(value: string): string | null {
	let url: URL
	try {
		url = new URL(value)
	} catch {
		return null
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return null
	return url.origin
}

/**
 * Lê `SISUB_MCP_ALLOWED_ORIGINS`. Entrada inválida derruba a partida em vez de ser ignorada:
 * uma origem digitada errado sumiria em silêncio e o cliente levaria 403 sem pista.
 */
export function parseAllowedOrigins(raw: string | undefined): ReadonlySet<string> {
	const origins = new Set<string>()
	for (const item of (raw ?? "").split(",")) {
		const value = item.trim()
		if (!value) continue
		if (value === "*") throw new Error(`${ALLOWED_ORIGINS_ENV}: "*" não é aceito; liste as origens exatas`)
		const origin = normalizeOrigin(value)
		if (!origin) throw new Error(`${ALLOWED_ORIGINS_ENV}: origem inválida "${value}" (esperado esquema://host[:porta])`)
		origins.add(origin)
	}
	return origins
}

export type OriginDecision =
	/** Sem `Origin`: não é navegador. */
	{ kind: "absent" } | { kind: "allowed"; origin: string } | { kind: "denied" }

/** Decide a requisição pelo cabeçalho `Origin` recebido. */
export function evaluateOrigin(originHeader: string | string[] | undefined, allowedOrigins: ReadonlySet<string>): OriginDecision {
	// Cabeçalho repetido não é algo que navegador mande: tratar como suspeito.
	if (Array.isArray(originHeader)) return { kind: "denied" }
	if (originHeader === undefined || originHeader === "") return { kind: "absent" }
	const origin = normalizeOrigin(originHeader)
	if (origin && allowedOrigins.has(origin)) return { kind: "allowed", origin }
	return { kind: "denied" }
}

/**
 * Cabeçalhos CORS da resposta. Só a origem permitida recebe `Access-Control-Allow-*`;
 * `Vary: Origin` vai sempre, para cache intermediário não servir a resposta de uma origem
 * a outra.
 */
export function corsHeadersFor(decision: OriginDecision): Record<string, string> {
	if (decision.kind !== "allowed") return { Vary: "Origin" }
	return {
		"Access-Control-Allow-Origin": decision.origin,
		"Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": ALLOWED_REQUEST_HEADERS,
		"Access-Control-Expose-Headers": EXPOSED_RESPONSE_HEADERS,
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
	}
}
