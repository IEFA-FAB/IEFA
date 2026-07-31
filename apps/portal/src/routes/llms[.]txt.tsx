import { createFileRoute } from "@tanstack/react-router"
import { absoluteUrl, ORGANIZATION_DESCRIPTION, PUBLIC_API, PUBLIC_PAGES, type PublicPage, SITE_DESCRIPTION, SITE_NAME } from "@/lib/agent-discovery"
import { client } from "@/lib/sanity"
import { getPortalServerClient } from "@/lib/supabase.server"

const RECENT_POSTS_LIMIT = 15

type Link = { title: string; url: string; summary: string }

/**
 * Títulos vêm de `iefa.apps` e do Sanity. Um `]` ou uma quebra de linha no título
 * quebra a sintaxe `[texto](url)` e chega a associar o rótulo à URL errada.
 */
function escapeLinkText(value: string) {
	return value
		.replace(/\s+/g, " ")
		.replace(/[[\]\\]/g, "\\$&")
		.trim()
}

/** Espaço e parênteses num destino de link também quebram a sintaxe. */
function escapeLinkUrl(value: string) {
	return value.replace(/\s/g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29")
}

function renderSection(heading: string, links: Link[]) {
	if (links.length === 0) return ""
	const body = links.map((link) => `- [${escapeLinkText(link.title)}](${escapeLinkUrl(link.url)}): ${link.summary.replace(/\s+/g, " ").trim()}`).join("\n")
	return `## ${heading}\n\n${body}\n`
}

function pageLink(page: PublicPage): Link {
	return { title: page.title, url: absoluteUrl(page.path), summary: page.summary }
}

/** Aplicações da suíte (schema `iefa`). Indisponibilidade do banco não derruba o documento. */
async function fetchSuiteLinks(): Promise<Link[]> {
	try {
		const { data, error } = await getPortalServerClient().from("apps").select("title, description, to_path, href").order("title", { ascending: true }).limit(50)
		if (error || !data) return []
		return data.flatMap((app) => {
			// `to_path` no banco às vezes vem com barra final, que responde 307 — normaliza.
			const internal = app.to_path ? absoluteUrl(app.to_path.replace(/(?!^\/)\/+$/, "")) : null
			const target = app.href ?? internal
			if (!target || !app.title) return []
			return [{ title: app.title, url: target, summary: app.description ?? "Aplicação da suíte IEFA." }]
		})
	} catch {
		return []
	}
}

/** Posts mais recentes do Sanity. */
async function fetchPostLinks(): Promise<Link[]> {
	try {
		const posts = await client.fetch<Array<{ title?: string; excerpt?: string; slug?: { current?: string }; publishedAt?: string }>>(
			`*[_type == "post" && defined(slug.current)] | order(publishedAt desc)[0...${RECENT_POSTS_LIMIT}] { title, excerpt, slug, publishedAt }`
		)
		return posts.flatMap((post) => {
			const slug = post.slug?.current
			if (!slug || !post.title) return []
			const date = post.publishedAt?.slice(0, 10)
			const summary = post.excerpt?.replace(/\s+/g, " ").trim() || "Publicação do blog do portal."
			return [
				{
					title: post.title,
					url: absoluteUrl(`/posts/${encodeURIComponent(slug)}`),
					summary: date ? `${summary} (${date})` : summary,
				},
			]
		})
	} catch {
		return []
	}
}

async function renderLlmsTxt() {
	const [suite, posts] = await Promise.all([fetchSuiteLinks(), fetchPostLinks()])

	const bySection = (section: PublicPage["section"]) => PUBLIC_PAGES.filter((page) => page.section === section).map(pageLink)

	const header = [
		`# ${SITE_NAME}`,
		"",
		`> ${SITE_DESCRIPTION} ${ORGANIZATION_DESCRIPTION}`,
		"",
		"Todo o conteúdo público está em português do Brasil. As rotas em português",
		"(`/sobre`, `/pesquisa`, `/publicacoes/{slug}`, `/instalacoes`) respondem 301 para os",
		"caminhos canônicos listados abaixo — prefira o destino canônico.",
		"",
		"Qualquer página deste site também é servida em Markdown: envie",
		"`Accept: text/markdown` e a resposta volta com `Content-Type: text/markdown`.",
		"",
	].join("\n")

	const sections = [
		renderSection("Institucional", bySection("Institucional")),
		renderSection("Facilidades", bySection("Facilidades")),
		renderSection("Suíte de aplicações", suite),
		renderSection("Revista SEIVA", bySection("Revista SEIVA")),
		renderSection("Conteúdo", [...bySection("Conteúdo"), ...posts]),
		renderSection("API", [
			{ title: `${PUBLIC_API.name} — especificação OpenAPI`, url: PUBLIC_API.openapi, summary: PUBLIC_API.description },
			{ title: `${PUBLIC_API.name} — documentação`, url: PUBLIC_API.docs, summary: "Referência navegável (Scalar) da API pública." },
			{
				title: "Catálogo de APIs",
				url: absoluteUrl("/.well-known/api-catalog"),
				summary: "Linkset RFC 9727 com as APIs públicas do IEFA.",
			},
		]),
		renderSection("Opcional", [
			{ title: "Autenticação", url: absoluteUrl("/auth.md"), summary: "Como agentes devem tratar as áreas autenticadas do portal." },
			{ title: "Sitemap", url: absoluteUrl("/sitemap.xml"), summary: "Todas as URLs públicas indexáveis." },
			{
				title: "Política de Privacidade",
				url: absoluteUrl("/politica-de-privacidade"),
				summary: "Tratamento de dados pessoais conforme a LGPD.",
			},
			{ title: "Termos de Uso", url: absoluteUrl("/termos-de-uso"), summary: "Condições de uso do portal." },
		]),
	]

	return `${header}\n${sections.filter(Boolean).join("\n")}`
}

export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET: async () => {
				return new Response(await renderLlmsTxt(), {
					headers: {
						"content-type": "text/plain; charset=utf-8",
						"cache-control": "public, max-age=3600",
					},
				})
			},
		},
	},
})
