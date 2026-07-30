import { createFileRoute } from "@tanstack/react-router"
import { buildLlmsTxt } from "@/lib/llms.server"

/**
 * Índice da documentação para agentes, materializado no prerender
 * (ver `prerender.routes` no vite.config.ts).
 */
export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET: () => new Response(buildLlmsTxt(), { headers: { "content-type": "text/plain; charset=utf-8" } }),
		},
	},
})
