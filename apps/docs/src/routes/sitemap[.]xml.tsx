import { createFileRoute } from "@tanstack/react-router"
import { buildDocsSitemap } from "@/lib/llms.server"

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: () => new Response(buildDocsSitemap(), { headers: { "content-type": "application/xml; charset=utf-8" } }),
		},
	},
})
