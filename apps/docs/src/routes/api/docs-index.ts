import { createFileRoute } from "@tanstack/react-router"
import { buildDocsIndex } from "@/lib/docs-index.server"

/**
 * Índice do site publicado como arquivo estático.
 *
 * Prerenderizado no build (ver `prerender.routes` no vite.config.ts) e enviado ao
 * S3/CloudFront junto com o resto do site. Substitui o `createServerFn` que a
 * rota `/docs/$` usava: sem servidor em runtime, a navegação client-side precisa
 * de um JSON que já exista no CDN.
 */
export const Route = createFileRoute("/api/docs-index")({
	server: {
		handlers: {
			GET: async () => Response.json(await buildDocsIndex()),
		},
	},
})
