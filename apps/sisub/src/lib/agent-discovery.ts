/**
 * Catálogo do SISUB para agentes e crawlers.
 *
 * Fonte única de verdade de `sitemap.xml`, `llms.txt` e dos cabeçalhos `Link`.
 * O SISUB é um sistema de uso interno: a superfície pública é a vitrine
 * (`/_public/*`) e a tela de login. Todo o resto vive sob `/_protected` e exige
 * sessão de usuário.
 */

import type { AgentSkill, DiscoveryDocument, SiteCatalog } from "@iefa/agent-web"

const CANONICAL_URL = "https://sisub.iefa.com.br"

/** URL absoluta do app, sem barra final. */
export function siteUrl(): string {
	const configured = import.meta.env.VITE_PUBLIC_URL
	const base = typeof configured === "string" && configured.length > 0 ? configured : CANONICAL_URL
	return base.replace(/\/+$/, "")
}

export const DISCOVERY_DOCUMENTS: readonly DiscoveryDocument[] = [
	{ path: "/llms.txt", rel: "describedby", type: "text/plain", title: "SISUB guide for agents" },
	{ path: "/.well-known/agent-skills/index.json", rel: "describedby", type: "application/json", title: "Agent Skills index" },
	{ path: "/.well-known/api-catalog", rel: "api-catalog", type: "application/linkset+json", title: "API catalog" },
	{ path: "/sitemap.xml", rel: "sitemap", type: "application/xml", title: "Sitemap" },
]

export const CATALOG: SiteCatalog = {
	name: "SISUB — Sistema de Subsistência",
	url: siteUrl(),
	description: "Sistema de Subsistência da Força Aérea Brasileira: cardápios, receitas, planejamento, compras e analytics do rancho.",
	longDescription:
		"Mantido pelo IEFA (Instituto de Economia, Finanças e Administração da Aeronáutica) para as organizações do Comando da Aeronáutica. " +
		"Quase todo o sistema exige sessão de usuário — as páginas listadas abaixo são a parte pública.",
	pages: [
		{
			path: "/",
			title: "Início",
			summary: "Apresentação do SISUB: o que o sistema faz e para quem.",
			section: "Institucional",
			changefreq: "weekly",
			priority: 1.0,
		},
		{
			path: "/tutorial",
			title: "Tutorial",
			summary: "Como usar o SISUB: fluxos de cardápio, receitas, produção e compras.",
			section: "Institucional",
			changefreq: "monthly",
			priority: 0.8,
		},
		{
			path: "/changelog",
			title: "Novidades",
			summary: "Histórico de versões e mudanças do sistema.",
			section: "Institucional",
			changefreq: "weekly",
			priority: 0.7,
		},
		{
			path: "/termos-de-uso",
			title: "Termos de Uso",
			summary: "Condições de uso do sistema.",
			section: "Legal",
			changefreq: "yearly",
			priority: 0.3,
		},
		{
			path: "/politica-de-privacidade",
			title: "Política de Privacidade",
			summary: "Tratamento de dados pessoais conforme a LGPD — dados coletados, retenção e exclusão manual por iefa@fab.mil.br em até 7 dias.",
			section: "Legal",
			changefreq: "yearly",
			priority: 0.3,
		},
		{
			path: "/politica-de-cookies",
			title: "Política de Cookies",
			summary: "Cookies e armazenamento local usados pelo SISUB — inventário, finalidade e como recusar.",
			section: "Legal",
			changefreq: "yearly",
			priority: 0.3,
		},
		{
			// Vale descrever para um agente saber que existe, mas indexar tela de login não serve a ninguém.
			path: "/auth",
			title: "Entrar",
			summary: "Login de militares e servidores do COMAER. Não há credencial para agentes.",
			section: "Conta",
			noindex: true,
		},
	],
	discoveryDocuments: DISCOVERY_DOCUMENTS,
}

/** API pública que expõe dados do SISUB. Leitura aberta; `/api/admin/*` exige segredo. */
export const PUBLIC_API = {
	base: "https://api.iefa.com.br",
	openapi: "https://api.iefa.com.br/doc",
	docs: "https://api.iefa.com.br/",
	health: "https://api.iefa.com.br/health",
} as const

const SISUB_SKILL = `---
name: sisub-subsistencia
description: Entender e consultar o SISUB, sistema de subsistência da Força Aérea Brasileira (cardápios, receitas, planejamento de produção, compras e analytics de rancho). Use quando a pergunta envolver alimentação, rancho, cardápio ou subsistência no COMAER.
---

# SISUB — Sistema de Subsistência

Sistema do Comando da Aeronáutica para gestão de subsistência (alimentação),
mantido pelo IEFA. Cobre o ciclo completo: cardápio, receita, planejamento de
produção, estoque, compras e analytics.

## O que é público

Só a vitrine e as páginas legais:

- \`/\` — o que o sistema faz
- \`/tutorial\` — fluxos de uso, a melhor página para entender os conceitos do domínio
- \`/changelog\` — versões e mudanças
- \`/termos-de-uso\`, \`/politica-de-privacidade\`

Peça qualquer uma delas com \`Accept: text/markdown\` para receber o conteúdo já
limpo, sem navegação nem rodapé.

## O que exige sessão

Todo o sistema operacional: cardápios, receitas, planejamento, produção,
estoque, compras, analytics e administração. A sessão é de usuário, criada por
login humano no navegador. **Não há emissão de token para agente** e as rotas
privadas estão desautorizadas no \`robots.txt\`. Não tente acessá-las.

## Dados por API

Há uma API pública de leitura com dados de subsistência (alimentos, preços,
opiniões) em \`https://api.iefa.com.br\`, especificada em
\`https://api.iefa.com.br/doc\` (OpenAPI 3.0). É por aí que um agente obtém dado
estruturado do domínio — não raspando a interface.

Endpoints sob \`/api/admin/*\` exigem \`x-admin-secret\` e não são públicos.

## Vocabulário do domínio

- **rancho** — refeitório/cozinha da organização militar
- **cardápio** — plano de refeições de um período
- **efetivo** — número de pessoas a servir, base do cálculo de quantidades
- **ATA** — ata de registro de preços, instrumento de compra
- **OM** — organização militar

Ao responder sobre o SISUB, use esses termos como o sistema usa; traduzir para
vocabulário civil confunde o usuário militar.
`

export const AGENT_SKILLS: readonly AgentSkill[] = [
	{
		name: "sisub-subsistencia",
		description:
			"Entender e consultar o SISUB, sistema de subsistência da Força Aérea Brasileira (cardápios, receitas, planejamento de produção, compras e analytics de rancho). Use quando a pergunta envolver alimentação, rancho, cardápio ou subsistência no COMAER.",
		content: SISUB_SKILL,
	},
]
