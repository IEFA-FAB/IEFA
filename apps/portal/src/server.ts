import type { Register } from "@tanstack/react-router"
import { createStartHandler, defaultStreamHandler, type RequestHandler } from "@tanstack/react-start/server"
import { htmlToMarkdown } from "@/server/agent/html-to-markdown"
import { asHtmlRequest, isUnsupportedAcceptResponse, notAcceptableResponse, prefersMarkdown, withDiscoveryLinks } from "@/server/agent/negotiation"

type StartHandler = RequestHandler<Register>
type HandlerOptions = Parameters<StartHandler>[1]

const startHandler: StartHandler = createStartHandler(defaultStreamHandler)

function isHtml(response: Response) {
	return response.headers.get("content-type")?.includes("text/html") ?? false
}

/**
 * Serve a página em Markdown. Redirects, 404 e respostas não-HTML passam
 * intactas — só o corpo HTML renderizado é convertido.
 */
async function respondWithMarkdown(request: Request, opts: HandlerOptions): Promise<Response> {
	const response = await startHandler(asHtmlRequest(request), opts)
	if (!response.ok || !isHtml(response)) return response

	const document = htmlToMarkdown(await response.text(), request.url)
	if (!document) return response

	const headers = new Headers(response.headers)
	headers.set("content-type", "text/markdown; charset=utf-8")
	headers.set("vary", "Accept")
	headers.delete("content-length")

	return new Response(document.markdown, { status: response.status, headers })
}

/**
 * Envelopa o handler do Start para adicionar negociação de conteúdo e os
 * cabeçalhos `Link` de descoberta. Ver `src/server/agent/negotiation.ts`.
 */
const fetch: StartHandler = async (request, opts) => {
	const response = prefersMarkdown(request) ? await respondWithMarkdown(request, opts) : await startHandler(request, opts)

	if (await isUnsupportedAcceptResponse(response)) {
		return withDiscoveryLinks(notAcceptableResponse(request))
	}

	return withDiscoveryLinks(response)
}

export default { fetch }
