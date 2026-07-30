/**
 * Entry de servidor com negociação de conteúdo para agentes.
 *
 * Envelopa o handler do TanStack Start. Cada app cria seu `src/server.ts` com:
 *
 * ```ts
 * import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server"
 * import { createAgentServerEntry } from "@iefa/agent-web/server"
 * import { CATALOG } from "@/lib/agent-discovery"
 *
 * export default createAgentServerEntry({
 *   handler: createStartHandler(defaultStreamHandler),
 *   discoveryDocuments: CATALOG.discoveryDocuments,
 * })
 * ```
 *
 * O nome do arquivo importa: o `start-plugin-core` resolve o entry do servidor como
 * `src/server.{ts,js,mts,mjs,tsx,jsx}`. Um `src/ssr.tsx` é ignorado — o plugin cai
 * no entry padrão embutido e o arquivo vira código morto.
 */

import { assertAsciiTitles, type DiscoveryDocument } from "../catalog.ts"
import { DEFAULT_CONTENT_SELECTORS, htmlToMarkdown } from "./html-to-markdown.ts"
import {
	asHtmlRequest,
	buildDiscoveryLinkHeader,
	isUnsupportedAcceptResponse,
	notAcceptableResponse,
	prefersMarkdown,
	withDiscoveryLinks,
} from "./negotiation.ts"

export type FetchHandler<TOptions> = (request: Request, opts: TOptions) => Promise<Response> | Response

export interface AgentServerEntryConfig<TOptions> {
	/** Normalmente `createStartHandler(defaultStreamHandler)`. */
	handler: FetchHandler<TOptions>
	/** Entram no header `Link` e no corpo do 406. Títulos precisam ser ASCII. */
	discoveryDocuments?: readonly DiscoveryDocument[]
	/**
	 * Seletores da região de conteúdo, testados em ordem. O padrão cobre os apps
	 * que usam `AppLayout` (`main#conteudo`) e cai para `main` e `body`.
	 */
	contentSelectors?: readonly string[]
}

export interface AgentServerEntry<TOptions> {
	fetch: FetchHandler<TOptions>
}

function isHtml(response: Response): boolean {
	return response.headers.get("content-type")?.includes("text/html") ?? false
}

export function createAgentServerEntry<TOptions>(config: AgentServerEntryConfig<TOptions>): AgentServerEntry<TOptions> {
	const documents = config.discoveryDocuments ?? []
	assertAsciiTitles(documents)

	const linkHeader = buildDiscoveryLinkHeader(documents)
	const contentSelectors = config.contentSelectors ?? DEFAULT_CONTENT_SELECTORS

	/**
	 * Serve a página em Markdown. Redirects, 404 e respostas não-HTML passam
	 * intactas — só o corpo HTML renderizado é convertido.
	 */
	async function respondWithMarkdown(request: Request, opts: TOptions): Promise<Response> {
		const response = await config.handler(asHtmlRequest(request), opts)
		if (!response.ok || !isHtml(response)) return response

		const document = htmlToMarkdown(await response.text(), request.url, contentSelectors)
		if (!document) return response

		const headers = new Headers(response.headers)
		headers.set("content-type", "text/markdown; charset=utf-8")
		headers.set("vary", "Accept")
		headers.delete("content-length")

		return new Response(document.markdown, { status: response.status, headers })
	}

	return {
		fetch: async (request, opts) => {
			const response = prefersMarkdown(request) ? await respondWithMarkdown(request, opts) : await config.handler(request, opts)

			if (await isUnsupportedAcceptResponse(response)) {
				return withDiscoveryLinks(notAcceptableResponse(request, documents), linkHeader)
			}

			return withDiscoveryLinks(response, linkHeader)
		},
	}
}
