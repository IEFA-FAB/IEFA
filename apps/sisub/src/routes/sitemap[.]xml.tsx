import { catalogSitemapEntries, renderSitemap } from "@iefa/agent-web"
import { createFileRoute } from "@tanstack/react-router"
import { CATALOG } from "@/lib/agent-discovery"

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: () =>
				new Response(renderSitemap(catalogSitemapEntries(CATALOG)), {
					headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
				}),
		},
	},
})
