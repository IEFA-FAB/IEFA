/**
 * Catálogo do contrate para agentes (`llms.txt`, `sitemap.xml`, Agent Skills).
 *
 * Só entram páginas públicas. A Plataforma ACI, o console do α e a tela de acessos
 * exigem sessão e mostram processo de contratação em elaboração — não são listados.
 */

import type { AgentSkill, DiscoveryDocument, SiteCatalog } from "@iefa/agent-web"

const CANONICAL_URL = "https://contrate.iefa.com.br"

/** URL absoluta do deploy, sem barra final. */
export function siteUrl(): string {
	const configured = import.meta.env.VITE_PUBLIC_URL
	const base = typeof configured === "string" && configured.length > 0 ? configured : CANONICAL_URL
	return base.replace(/\/+$/, "")
}

export const DISCOVERY_DOCUMENTS: readonly DiscoveryDocument[] = [
	{ path: "/llms.txt", rel: "describedby", type: "text/plain", title: "Guide for agents" },
	{ path: "/.well-known/agent-skills/index.json", rel: "describedby", type: "application/json", title: "Agent Skills index" },
	{ path: "/sitemap.xml", rel: "sitemap", type: "application/xml", title: "Sitemap" },
]

export const CATALOG: SiteCatalog = {
	name: "Contrate",
	url: siteUrl(),
	description: "Copiloto de aquisições da Força Aérea Brasileira, mantido pelo IEFA (Projeto α).",
	longDescription:
		"Verificação de Estudo Técnico Preliminar e Termo de Referência contra a Lei 14.133/21 e as normas do COMAER, " +
		"fila de conformidade para o controle interno e apoio à condução do pregão. As ferramentas de verificação exigem sessão.",
	pages: [
		{
			path: "/",
			title: "Início",
			summary: "Apresentação do copiloto, das ferramentas e do fluxo de verificação.",
			section: "Institucional",
			changefreq: "monthly",
			priority: 1.0,
		},
		{
			path: "/pregoeiro",
			title: "Facilidades do Pregoeiro",
			summary: "Biblioteca de frases por fase do pregão eletrônico.",
			section: "Ferramentas",
			changefreq: "weekly",
			priority: 0.7,
		},
		{
			path: "/auth",
			title: "Entrar",
			summary: "Login com conta do COMAER.",
			section: "Conta",
			noindex: true,
		},
		{
			path: "/termos-de-uso",
			title: "Termos de Uso",
			summary: "Condições de acesso e uso da plataforma.",
			section: "Legal",
			changefreq: "yearly",
			priority: 0.3,
		},
		{
			path: "/politica-de-privacidade",
			title: "Política de Privacidade",
			summary: "Tratamento de dados pessoais conforme a LGPD — exclusão manual por iefa@fab.mil.br em até 7 dias.",
			section: "Legal",
			changefreq: "yearly",
			priority: 0.3,
		},
		{
			path: "/politica-de-cookies",
			title: "Política de Cookies",
			summary: "Cookies e armazenamento local — inventário, finalidade e como recusar.",
			section: "Legal",
			changefreq: "yearly",
			priority: 0.3,
		},
	],
	discoveryDocuments: DISCOVERY_DOCUMENTS,
}

const SKILL_DESCRIPTION =
	"Entender o copiloto de aquisições da FAB (Contrate) — o que a verificação de ETP/TR faz, o que é aberto e o que exige sessão. Use quando a pergunta envolver contratações públicas no COMAER, Lei 14.133/21, ETP, TR ou pregão."

export const AGENT_SKILLS: readonly AgentSkill[] = [
	{
		name: "contrate-iefa",
		description: SKILL_DESCRIPTION,
		content: `---
name: contrate-iefa
description: ${SKILL_DESCRIPTION}
---

# Contrate — copiloto de aquisições da FAB

Mantido pelo IEFA como parte do Projeto α.

## O que é aberto

- \`/\` — apresentação e fluxo de verificação.
- \`/pregoeiro\` — biblioteca de frases por fase do pregão.

## O que exige sessão

A Plataforma ACI (\`/aci\`), o envio de documento para verificação e o console
técnico (\`/alpha/*\`) exigem conta do COMAER e perfil concedido pela administração.
Os documentos ali são contratações em elaboração. Não há credencial para agente.

## Ao interagir

O achado da verificação é apoio, não decisão: cada um cita o dispositivo da norma, e
quem acata ou descarta é o analista de controle interno. Não apresente um achado como
parecer.
`,
	},
]
