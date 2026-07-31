import { renderLlmsTxt } from "@iefa/agent-web"
import { createFileRoute } from "@tanstack/react-router"
import { CATALOG, siteUrl } from "@/lib/agent-discovery"

const NOTES = [
	"Responder a um questionário é aberto: basta o link (`/respond/{id}`), sem login.",
	"Os identificadores não são enumerados aqui nem no `sitemap.xml` — sem o link,",
	"não há como descobrir o questionário. É intencional.",
	"",
	"Criar questionários e ver respostas exigem sessão de usuário do COMAER.",
	"",
	"Qualquer página é servida em Markdown: envie `Accept: text/markdown`.",
]

export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET: () => {
				const body = renderLlmsTxt(CATALOG, {
					notes: NOTES,
					optional: [
						{
							title: "Agent Skills",
							url: `${siteUrl()}/.well-known/agent-skills/index.json`,
							summary: "Skill com o escopo do programa e as regras de uso.",
						},
						{ title: "Sitemap", url: `${siteUrl()}/sitemap.xml`, summary: "URLs públicas indexáveis." },
					],
				})

				return new Response(body, {
					headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
				})
			},
		},
	},
})
