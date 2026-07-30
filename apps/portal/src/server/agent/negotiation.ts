/**
 * Negociação de conteúdo para agentes.
 *
 * O handler do TanStack Start responde 500 (`Only HTML requests are supported here`)
 * para qualquer requisição de rota cujo `Accept` não contenha `text/html` nem o coringa.
 * Isso vale para o site inteiro, então `curl -H "Accept: application/json" /` também
 * quebrava. Aqui o comportamento é corrigido em duas frentes:
 *
 * 1. `Accept: text/markdown` passa a devolver a página em Markdown.
 * 2. Os demais tipos não suportados viram `406 Not Acceptable` com corpo explicativo,
 *    em vez de um 500 que sugere falha do servidor.
 */

import { DISCOVERY_DOCUMENTS } from "@/lib/agent-discovery"

/** Corpo exato emitido pelo `executeRouter` do Start quando o `Accept` não é suportado. */
const START_UNSUPPORTED_ACCEPT_BODY = '{"error":"Only HTML requests are supported here"}'

const MARKDOWN_TYPES = ["text/markdown", "text/x-markdown"]

interface AcceptEntry {
	type: string
	q: number
}

function parseAccept(header: string | null): AcceptEntry[] {
	if (!header) return []
	return header
		.split(",")
		.map((part) => {
			const [rawType, ...params] = part.split(";")
			const type = rawType.trim().toLowerCase()
			const qParam = params.find((p) => p.trim().startsWith("q="))
			const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1
			return { type, q: Number.isFinite(q) ? q : 1 }
		})
		.filter((entry) => entry.type.length > 0 && entry.q > 0)
}

function qualityFor(entries: AcceptEntry[], types: string[]): number {
	let best = 0
	for (const entry of entries) {
		if (types.includes(entry.type)) best = Math.max(best, entry.q)
	}
	return best
}

/**
 * Verdadeiro quando o cliente prefere Markdown a HTML. Um navegador manda
 * `text/html,...;q=0.9` seguido do coringa com `q=0.8`, e nunca cai aqui.
 */
export function prefersMarkdown(request: Request): boolean {
	if (request.method !== "GET" && request.method !== "HEAD") return false
	const entries = parseAccept(request.headers.get("accept"))
	const markdown = qualityFor(entries, MARKDOWN_TYPES)
	if (markdown === 0) return false
	return markdown >= qualityFor(entries, ["text/html", "application/xhtml+xml"])
}

/** Requisição equivalente pedindo HTML, para obter a renderização do SSR. */
export function asHtmlRequest(request: Request): Request {
	const headers = new Headers(request.headers)
	headers.set("accept", "text/html")
	return new Request(request, { headers })
}

/** Identifica o 500 genérico do Start para trocá-lo por um 406 correto. */
export async function isUnsupportedAcceptResponse(response: Response): Promise<boolean> {
	if (response.status !== 500) return false
	if (!response.headers.get("content-type")?.includes("application/json")) return false
	const body = await response.clone().text()
	return body.trim() === START_UNSUPPORTED_ACCEPT_BODY
}

export function notAcceptableResponse(request: Request): Response {
	const accept = request.headers.get("accept") ?? "(vazio)"
	const body = [
		`# 406 Not Acceptable`,
		"",
		`Accept recebido: ${accept}`,
		"",
		"Este endereço serve `text/html` e `text/markdown`.",
		"Para a versão em Markdown, envie `Accept: text/markdown`.",
		"Para dados estruturados, veja:",
		...DISCOVERY_DOCUMENTS.map((doc) => `  - ${doc.path} (${doc.type})`),
		"",
	].join("\n")

	return new Response(body, {
		status: 406,
		headers: {
			"content-type": "text/plain; charset=utf-8",
			vary: "Accept",
		},
	})
}

const DISCOVERY_LINK_HEADER = DISCOVERY_DOCUMENTS.map((doc) => `<${doc.path}>; rel="${doc.rel}"; type="${doc.type}"; title="${doc.title}"`).join(", ")

/** Tipos de resposta que um agente pode estar lendo como documento. */
const LINKABLE_TYPES = ["text/html", "text/markdown", "text/plain"]

/**
 * Anexa os links de descoberta (RFC 8288) sem descartar `Link` já emitido pelo
 * Start para preload de assets.
 *
 * Só em respostas de documento: chamadas de server function são frequentes e não
 * têm o que fazer com ~400 bytes de header a cada RPC.
 */
export function withDiscoveryLinks(response: Response): Response {
	const contentType = response.headers.get("content-type") ?? ""
	if (!LINKABLE_TYPES.some((type) => contentType.includes(type))) return response

	const headers = new Headers(response.headers)
	const existing = headers.get("link")
	headers.set("link", existing ? `${existing}, ${DISCOVERY_LINK_HEADER}` : DISCOVERY_LINK_HEADER)
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
