import { createFileRoute } from "@tanstack/react-router"
import { absoluteUrl, PUBLIC_PAGES } from "@/lib/agent-discovery"
import { client } from "@/lib/sanity"

interface SitemapEntry {
	loc: string
	lastmod?: string
	changefreq: string
	priority: number
}

function escapeXml(value: string) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

/**
 * Posts do Sanity. Falha de rede não pode derrubar o sitemap inteiro — sem os
 * posts o documento ainda vale para as páginas estáticas.
 */
async function fetchPostEntries(): Promise<SitemapEntry[]> {
	try {
		const posts = await client.fetch<Array<{ slug?: { current?: string }; publishedAt?: string }>>(
			`*[_type == "post" && defined(slug.current)] | order(publishedAt desc) { slug, publishedAt }`
		)
		return posts.flatMap((post) => {
			const slug = post.slug?.current
			if (!slug) return []
			return [
				{
					loc: absoluteUrl(`/posts/${encodeURIComponent(slug)}`),
					lastmod: post.publishedAt?.slice(0, 10),
					changefreq: "yearly",
					priority: 0.6,
				},
			]
		})
	} catch {
		return []
	}
}

function renderSitemap(entries: SitemapEntry[]) {
	const urls = entries
		.map((entry) => {
			const lastmod = entry.lastmod ? `\n\t\t<lastmod>${entry.lastmod}</lastmod>` : ""
			return `\t<url>\n\t\t<loc>${escapeXml(entry.loc)}</loc>${lastmod}\n\t\t<changefreq>${entry.changefreq}</changefreq>\n\t\t<priority>${entry.priority.toFixed(1)}</priority>\n\t</url>`
		})
		.join("\n")
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: async () => {
				const staticEntries: SitemapEntry[] = PUBLIC_PAGES.map((page) => ({
					loc: absoluteUrl(page.path),
					changefreq: page.changefreq,
					priority: page.priority,
				}))

				const body = renderSitemap([...staticEntries, ...(await fetchPostEntries())])

				return new Response(body, {
					headers: {
						"content-type": "application/xml; charset=utf-8",
						"cache-control": "public, max-age=3600",
					},
				})
			},
		},
	},
})
