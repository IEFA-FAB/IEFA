import { createFileRoute } from "@tanstack/react-router"
import { buildLlmsFullTxt } from "@/lib/llms.server"

/**
 * Documentação inteira em um arquivo Markdown. Como o site é estático, é por
 * aqui que um agente obtém o conteúdo — não há negociação por `Accept`.
 */
export const Route = createFileRoute("/llms-full.txt")({
	server: {
		handlers: {
			GET: async () => new Response(await buildLlmsFullTxt(), { headers: { "content-type": "text/plain; charset=utf-8" } }),
		},
	},
})
