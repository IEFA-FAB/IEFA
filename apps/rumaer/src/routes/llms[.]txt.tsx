import { type LlmsLink, renderLlmsTxt } from "@iefa/agent-web"
import { createFileRoute } from "@tanstack/react-router"
import { absoluteUrl, CATALOG, siteUrl } from "@/lib/agent-discovery"
import { getRumaerServerClient } from "@/lib/supabase.server"
import { GRUPO_DESCRIPTIONS, GRUPO_LABELS, uniformTitle } from "@/lib/uniforms/labels"

const NOTES = [
	"Grupos de uniforme e o que cada um cobre:",
	...Object.entries(GRUPO_LABELS).map(([grupo, label]) => `- **${label}**: ${GRUPO_DESCRIPTIONS[grupo as keyof typeof GRUPO_DESCRIPTIONS]}`),
	"",
	"O catálogo de uniformes é público e não exige login.",
	"",
	"Qualquer página é servida em Markdown: envie `Accept: text/markdown`.",
	"",
	"`/uniformes` redireciona para `/` preservando a query string — cite `/` ou a página do uniforme.",
]

/** Uniformes agrupados por finalidade, como aparecem na home. */
async function fetchUniformSections() {
	try {
		const { data, error } = await getRumaerServerClient()
			.from("uniform")
			.select("id, nome, numero, letra, grupo")
			.is("deleted_at", null)
			.order("ordem", { ascending: true })

		if (error || !data) {
			console.error("[llms.txt] falha ao ler uniformes; publicando só as páginas fixas:", error)
			return []
		}

		const byGroup = new Map<string, LlmsLink[]>()
		for (const uniform of data) {
			const links = byGroup.get(uniform.grupo) ?? []
			links.push({
				title: uniformTitle(uniform),
				url: absoluteUrl(`/uniformes/${uniform.id}`),
				summary: uniform.nome,
			})
			byGroup.set(uniform.grupo, links)
		}

		return Array.from(byGroup.entries()).map(([grupo, links]) => ({
			heading: `Uniformes — ${GRUPO_LABELS[grupo as keyof typeof GRUPO_LABELS] ?? grupo}`,
			links,
		}))
	} catch (cause) {
		console.error("[llms.txt] falha ao ler uniformes; publicando só as páginas fixas:", cause)
		return []
	}
}

export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET: async () => {
				const body = renderLlmsTxt(CATALOG, {
					notes: NOTES,
					sections: await fetchUniformSections(),
					optional: [
						{
							title: "Agent Skills",
							url: `${siteUrl()}/.well-known/agent-skills/index.json`,
							summary: "Skill com o vocabulário de uniformes e as variações por perfil.",
						},
						{ title: "Sitemap", url: `${siteUrl()}/sitemap.xml`, summary: "Todas as URLs públicas, incluindo cada uniforme." },
					],
				})

				return new Response(body, {
					headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
				})
			},
		},
	},
})
