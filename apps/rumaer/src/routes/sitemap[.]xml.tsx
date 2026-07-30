import { catalogSitemapEntries, renderSitemap, type SitemapEntry } from "@iefa/agent-web"
import { createFileRoute } from "@tanstack/react-router"
import { absoluteUrl, CATALOG } from "@/lib/agent-discovery"
import { getRumaerServerClient } from "@/lib/supabase.server"

/**
 * Páginas de uniforme. O catálogo é público, então enumerá-lo no sitemap é o
 * jeito mais direto de um agente descobrir o que existe. Falha de banco não
 * derruba o documento — sem os uniformes ele ainda vale para as páginas fixas.
 */
async function fetchUniformEntries(): Promise<SitemapEntry[]> {
	try {
		const { data, error } = await getRumaerServerClient().from("uniform").select("id, updated_at").is("deleted_at", null).order("ordem", { ascending: true })

		if (error || !data) return []

		return data.map((uniform) => ({
			loc: absoluteUrl(`/uniformes/${uniform.id}`),
			lastmod: typeof uniform.updated_at === "string" ? uniform.updated_at.slice(0, 10) : undefined,
			changefreq: "monthly",
			priority: 0.8,
		}))
	} catch {
		return []
	}
}

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: async () => {
				const entries = [...catalogSitemapEntries(CATALOG), ...(await fetchUniformEntries())]

				return new Response(renderSitemap(entries), {
					headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
				})
			},
		},
	},
})
