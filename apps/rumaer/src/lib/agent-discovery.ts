/**
 * Catálogo do RUMAER para agentes e crawlers.
 *
 * Fonte única de verdade de `sitemap.xml`, `llms.txt` e dos cabeçalhos `Link`.
 * Diferente dos outros sistemas do IEFA, o RUMAER tem conteúdo genuinamente
 * público: o catálogo de uniformes é consultável sem login.
 */

import type { AgentSkill, DiscoveryDocument, SiteCatalog } from "@iefa/agent-web"

const CANONICAL_URL = "https://rumaer.iefa.com.br"

/** URL absoluta do app, sem barra final. */
export function siteUrl(): string {
	const configured = import.meta.env.VITE_PUBLIC_URL
	const base = typeof configured === "string" && configured.length > 0 ? configured : CANONICAL_URL
	return base.replace(/\/+$/, "")
}

/** Resolve um caminho iniciado por `/` em URL absoluta. */
export function absoluteUrl(path: string): string {
	return `${siteUrl()}${path}`
}

export const DISCOVERY_DOCUMENTS: readonly DiscoveryDocument[] = [
	{ path: "/llms.txt", rel: "describedby", type: "text/plain", title: "RUMAER guide for agents" },
	{ path: "/.well-known/agent-skills/index.json", rel: "describedby", type: "application/json", title: "Agent Skills index" },
	{ path: "/sitemap.xml", rel: "sitemap", type: "application/xml", title: "Sitemap" },
]

export const CATALOG: SiteCatalog = {
	name: "RUMAER — Regulamento de Uniformes da Aeronáutica",
	url: siteUrl(),
	description: "Consulta interativa ao Regulamento de Uniformes da Aeronáutica: uniformes, peças, composições e equivalências por perfil militar.",
	longDescription:
		"Mantido pelo IEFA para o Comando da Aeronáutica. O catálogo de uniformes é público e não exige login; " + "só a administração do conteúdo é restrita.",
	pages: [
		{
			path: "/",
			title: "Consulta de uniformes",
			summary: "Busca por uniforme e catálogo completo agrupado por finalidade. Aceita filtro por grupo e categoria via query string.",
			section: "Consulta",
			changefreq: "weekly",
			priority: 1.0,
		},
		{
			path: "/auth",
			title: "Entrar",
			summary: "Login para gestores de conteúdo. A consulta de uniformes não exige login.",
			section: "Conta",
			noindex: true,
		},
	],
	discoveryDocuments: DISCOVERY_DOCUMENTS,
}

const RUMAER_SKILL = `---
name: rumaer-uniformes
description: Consultar o Regulamento de Uniformes da Aeronáutica (RUMAER) — quais uniformes existem, suas peças, composições e quando cada um é usado. Use quando a pergunta envolver uniforme, fardamento ou traje militar da Força Aérea Brasileira.
---

# RUMAER — Uniformes da Aeronáutica

Consulta interativa ao Regulamento de Uniformes da Aeronáutica, mantida pelo
IEFA. **Conteúdo público**: não exige login.

## Como consultar

A home (\`/\`) traz busca e o catálogo completo. Cada uniforme tem página própria
em \`/uniformes/{id}\`, com as peças que o compõem e a obrigatoriedade de cada uma.

Peça qualquer página com \`Accept: text/markdown\` para receber o conteúdo já
limpo:

\`\`\`
GET https://rumaer.iefa.com.br/uniformes/{id}
Accept: text/markdown
\`\`\`

O \`/sitemap.xml\` lista todos os uniformes do catálogo — é a forma mais direta de
enumerar o que existe.

> \`/uniformes\` (a listagem antiga) redireciona para \`/\`, preservando a query
> string. Cite \`/\` ou a página do uniforme específico.

## Grupos de uniforme

- **históricos** — tradição e cerimônias históricas
- **representação** — gala, passeio e situações de representação
- **serviços** — serviço administrativo e operacional
- **educação física** — agasalho, camiseta e tênis
- **desfile**

Um uniforme é identificado por número e letra ("3º Uniforme B") ou por nome
quando não tem numeração. Use a forma que a página mostra; inventar numeração é
erro comum.

## Variações

Um mesmo uniforme muda conforme categoria militar (oficial, graduado…), gênero e
subvariação (gestante, tropa montada). Ao responder, diga a qual perfil a
composição se aplica — a peça obrigatória para um perfil pode não ser para outro.

## O que é restrito

\`/admin/*\` é a administração do conteúdo e exige sessão de gestor. Está
desautorizado no \`robots.txt\`. Não há credencial para agentes.
`

export const AGENT_SKILLS: readonly AgentSkill[] = [
	{
		name: "rumaer-uniformes",
		description:
			"Consultar o Regulamento de Uniformes da Aeronáutica (RUMAER) — quais uniformes existem, suas peças, composições e quando cada um é usado. Use quando a pergunta envolver uniforme, fardamento ou traje militar da Força Aérea Brasileira.",
		content: RUMAER_SKILL,
	},
]
