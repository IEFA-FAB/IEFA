import { renderLlmsTxt } from "@iefa/agent-web"
import { createFileRoute } from "@tanstack/react-router"
import { CATALOG, PUBLIC_API, siteUrl } from "@/lib/agent-discovery"

const NOTES = [
	"O SISUB é de uso interno do COMAER. As páginas abaixo são a superfície pública;",
	"o sistema operacional exige sessão de usuário criada por login humano.",
	"",
	"Qualquer página pública também é servida em Markdown: envie `Accept: text/markdown`.",
	"",
	"Para dado estruturado de subsistência, use a API em vez de raspar a interface.",
]

export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET: () => {
				const body = renderLlmsTxt(CATALOG, {
					notes: NOTES,
					sections: [
						{
							heading: "API",
							links: [
								{
									title: "Sisub API — especificação OpenAPI",
									url: PUBLIC_API.openapi,
									summary: "Dados de subsistência (alimentos, preços, opiniões). Leitura pública, sem autenticação.",
								},
								{ title: "Sisub API — documentação", url: PUBLIC_API.docs, summary: "Referência navegável da API." },
							],
						},
					],
					optional: [
						{
							title: "Agent Skills",
							url: `${siteUrl()}/.well-known/agent-skills/index.json`,
							summary: "Skill com o vocabulário do domínio de subsistência.",
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
