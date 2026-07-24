import { createFileRoute } from "@tanstack/react-router"
import { createFromSource } from "fumadocs-core/search/server"
import { source } from "@/lib/source"

const server = createFromSource(source)

/**
 * Índice de busca exportado — não é mais um endpoint de query.
 *
 * `staticGET()` serializa o índice Orama inteiro uma única vez, no build. O
 * cliente baixa esse arquivo e roda a busca no próprio navegador. Antes era
 * `server.GET(request)`, que exigia um servidor vivo a cada tecla digitada.
 */
export const Route = createFileRoute("/api/search")({
	server: {
		handlers: {
			GET: async () => server.staticGET(),
		},
	},
})
