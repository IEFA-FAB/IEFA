/**
 * Negociação de conteúdo para agentes.
 *
 * O handler do TanStack Start responde 500 (`Only HTML requests are supported here`)
 * para qualquer requisição de rota cujo `Accept` não contenha `text/html` nem o
 * coringa — ver `executeRouter` em `start-server-core/src/createStartHandler.ts`.
 * Isso vale para o site inteiro, então `curl -H "Accept: application/json" /` também
 * quebra. Aqui o comportamento é corrigido em duas frentes:
 *
 * 1. `Accept: text/markdown` passa a devolver a página em Markdown.
 * 2. Os demais tipos não suportados viram `406 Not Acceptable` com corpo explicativo,
 *    em vez de um 500 que sugere falha do servidor.
 *
 * Não dá para resolver isso com request middleware: `executeRouter` lê o `request`
 * do closure, então trocar `ctx.request` via `next({ request })` não tem efeito. A
 * única costura possível é envelopar o handler no entry do servidor.
 */

import type { DiscoveryDocument } from "../catalog"

/** Corpo exato emitido pelo `executeRouter` do Start quando o `Accept` não é suportado. */
const START_UNSUPPORTED_ACCEPT_BODY = '{"error":"Only HTML requests are supported here"}'

const MARKDOWN_TYPES = ["text/markdown", "text/x-markdown"]

/** Tipos de resposta que um agente pode estar lendo como documento. */
const LINKABLE_TYPES = ["text/html", "text/markdown", "text/plain"]

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

/** Melhor qualidade entre correspondências exatas. */
function exactQuality(entries: AcceptEntry[], types: readonly string[]): number {
	let best = 0
	for (const entry of entries) {
		if (types.includes(entry.type)) best = Math.max(best, entry.q)
	}
	return best
}

/**
 * Melhor qualidade considerando também os coringas que cobrem o tipo
 * (`text/*` e o coringa geral), conforme a RFC 9110.
 */
function qualityWithWildcards(entries: AcceptEntry[], types: readonly string[]): number {
	let best = 0
	for (const type of types) {
		const group = `${type.slice(0, type.indexOf("/"))}/*`
		for (const entry of entries) {
			if (entry.type === type || entry.type === group || entry.type === "*/*") {
				best = Math.max(best, entry.q)
			}
		}
	}
	return best
}

/**
 * Verdadeiro quando o cliente prefere Markdown a HTML.
 *
 * Markdown só conta em correspondência **exata**: servir Markdown para quem
 * mandou apenas o coringa seria trocar o padrão da web por um palpite. HTML, por
 * outro lado, conta também via coringa — quem manda `text/markdown;q=0.5` junto
 * com o coringa em `q=1` está dizendo que prefere qualquer outra coisa, e HTML é
 * uma delas.
 *
 * Empate resolve a favor do Markdown, que foi pedido de propósito.
 */
export function prefersMarkdown(request: Request): boolean {
	if (request.method !== "GET" && request.method !== "HEAD") return false
	const entries = parseAccept(request.headers.get("accept"))
	const markdown = exactQuality(entries, MARKDOWN_TYPES)
	if (markdown === 0) return false
	return markdown >= qualityWithWildcards(entries, ["text/html", "application/xhtml+xml"])
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

export function notAcceptableResponse(request: Request, documents: readonly DiscoveryDocument[]): Response {
	const accept = request.headers.get("accept") ?? "(vazio)"
	const body = [
		"# 406 Not Acceptable",
		"",
		`Accept recebido: ${accept}`,
		"",
		"Este endereço serve `text/html` e `text/markdown`.",
		"Para a versão em Markdown, envie `Accept: text/markdown`.",
		...(documents.length > 0 ? ["Para dados estruturados, veja:", ...documents.map((doc) => `  - ${doc.path} (${doc.type})`)] : []),
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

export function buildDiscoveryLinkHeader(documents: readonly DiscoveryDocument[]): string {
	return documents.map((doc) => `<${doc.path}>; rel="${doc.rel}"; type="${doc.type}"; title="${doc.title}"`).join(", ")
}

/**
 * Anexa os links de descoberta (RFC 8288) sem descartar `Link` já emitido pelo
 * Start para preload de assets.
 *
 * Só em respostas de documento: chamadas de server function são frequentes e não
 * têm o que fazer com centenas de bytes de header a cada RPC.
 */
export function withDiscoveryLinks(response: Response, linkHeader: string): Response {
	if (linkHeader.length === 0) return response

	const contentType = response.headers.get("content-type") ?? ""
	if (!LINKABLE_TYPES.some((type) => contentType.includes(type))) return response

	const headers = new Headers(response.headers)
	const existing = headers.get("link")
	headers.set("link", existing ? `${existing}, ${linkHeader}` : linkHeader)
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
