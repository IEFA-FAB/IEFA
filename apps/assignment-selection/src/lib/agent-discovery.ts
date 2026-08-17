/**
 * Catálogo do app de escolha de vagas para agentes.
 *
 * Este é um app de evento: o telão (`/`) e o controle (`/controller`) são usados
 * ao vivo durante a sessão de escolha de vagas, com sessão autenticada. Não há
 * conteúdo público — por isso não publica `sitemap.xml` nem Agent Skills, e o
 * `robots.txt` nega tudo.
 *
 * O que se publica é descrição, para que um agente que encontre o domínio saiba
 * o que é e não fique sondando rotas.
 */

import type { DiscoveryDocument, SiteCatalog } from "@iefa/agent-web"

const CANONICAL_URL = "https://vagas.iefa.com.br"

/** URL absoluta do app, sem barra final. */
export function siteUrl(): string {
	const configured = import.meta.env.VITE_PUBLIC_URL
	const base = typeof configured === "string" && configured.length > 0 ? configured : CANONICAL_URL
	return base.replace(/\/+$/, "")
}

export const DISCOVERY_DOCUMENTS: readonly DiscoveryDocument[] = [{ path: "/llms.txt", rel: "describedby", type: "text/plain", title: "Guide for agents" }]

export const CATALOG: SiteCatalog = {
	name: "Escolha de Vagas — CPAINT",
	url: siteUrl(),
	description: "Painel de escolha de vagas por ordem de classificação, usado ao vivo durante a sessão do CPAINT.",
	longDescription:
		"Mantido pelo IEFA para o Comando da Aeronáutica. O telão e o controle são operados durante o evento por " +
		"pessoal autorizado; não há conteúdo público nem API aberta.",
	pages: [
		{
			path: "/",
			title: "Telão",
			summary: "Projeção ao vivo da sessão de escolha: vagas disponíveis e ordem de classificação.",
			section: "Evento",
			noindex: true,
		},
		{
			path: "/controller",
			title: "Controle",
			summary: "Operação da sessão pelo condutor do evento.",
			section: "Evento",
			noindex: true,
		},
		{
			path: "/auth",
			title: "Entrar",
			summary: "Login do pessoal autorizado a operar a sessão.",
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
			summary: "Tratamento de dados pessoais conforme a LGPD — coleta, retenção e exclusão manual por iefa@fab.mil.br em até 7 dias.",
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
