/**
 * Catálogo da documentação para agentes.
 *
 * O site é estático (S3 + CloudFront), sem servidor em runtime. Por isso aqui
 * **não há negociação de conteúdo**: o caminho para um agente obter o conteúdo é
 * `llms-full.txt`, materializado no prerender, e não `Accept: text/markdown`.
 */

import type { DiscoveryDocument, SiteCatalog } from "@iefa/agent-web"
import { appName } from "./shared"

const CANONICAL_URL = "https://docs.iefa.com.br"

/** URL absoluta do site, sem barra final. */
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
	{ path: "/llms.txt", rel: "describedby", type: "text/plain", title: "Docs index for agents" },
	{ path: "/llms-full.txt", rel: "alternate", type: "text/plain", title: "Full documentation as Markdown" },
	{ path: "/sitemap.xml", rel: "sitemap", type: "application/xml", title: "Sitemap" },
]

/**
 * As páginas de documentação não entram aqui: são descobertas do `source` do
 * fumadocs em `llms.server.ts`, para que o catálogo não precise ser mantido em
 * paralelo com o conteúdo.
 */
export const CATALOG: SiteCatalog = {
	name: appName,
	url: siteUrl(),
	description: "Documentação da suíte de aplicações do Instituto de Economia, Finanças e Administração da Aeronáutica.",
	pages: [],
	discoveryDocuments: DISCOVERY_DOCUMENTS,
}
