/**
 * Tipos do catálogo que cada app descreve sobre si mesmo.
 *
 * Um `SiteCatalog` é a fonte única de verdade do app: `sitemap.xml`, `llms.txt`,
 * `/.well-known/*` e os cabeçalhos `Link` derivam todos dele, para que nenhuma
 * lista possa dessincronizar.
 */

export type ChangeFreq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never"

export interface PublicPage {
	/** Caminho canônico iniciado por `/`, sem barra final. */
	path: string
	title: string
	summary: string
	/** Agrupamento no `llms.txt`. Páginas da mesma seção saem juntas, na ordem do array. */
	section: string
	changefreq?: ChangeFreq
	priority?: number
	/**
	 * Fora do `sitemap.xml`. Use para páginas que valem descrição para um agente mas
	 * não devem ser indexadas — tela de login, por exemplo.
	 */
	noindex?: boolean
}

export interface DiscoveryDocument {
	path: string
	/** Relação IANA. Ex.: `describedby`, `api-catalog`, `service-doc`, `sitemap`. */
	rel: string
	type: string
	/**
	 * Só ASCII: valores de header HTTP não carregam UTF-8 e acento sai corrompido
	 * no fio. Validado por `assertAsciiTitles`.
	 */
	title: string
}

export interface SiteCatalog {
	name: string
	/** URL absoluta sem barra final. Ex.: `https://sisub.iefa.com.br`. */
	url: string
	description: string
	/** Parágrafo de contexto no `llms.txt`, logo abaixo da descrição. */
	longDescription?: string
	pages: readonly PublicPage[]
	discoveryDocuments: readonly DiscoveryDocument[]
}

export function absoluteUrl(catalog: Pick<SiteCatalog, "url">, path: string): string {
	return `${catalog.url.replace(/\/+$/, "")}${path}`
}

/** Páginas indexáveis, na ordem declarada. */
export function indexablePages(catalog: SiteCatalog): PublicPage[] {
	return catalog.pages.filter((page) => !page.noindex)
}

export function pagesBySection(catalog: SiteCatalog): Array<{ section: string; pages: PublicPage[] }> {
	const order: string[] = []
	const grouped = new Map<string, PublicPage[]>()

	for (const page of catalog.pages) {
		const existing = grouped.get(page.section)
		if (existing) {
			existing.push(page)
			continue
		}
		order.push(page.section)
		grouped.set(page.section, [page])
	}

	return order.map((section) => ({ section, pages: grouped.get(section) ?? [] }))
}

/**
 * Falha cedo se algum título de documento de descoberta tiver caractere não-ASCII.
 * Chamado na montagem do entry, para o erro aparecer no boot e não como header
 * corrompido em produção.
 */
export function assertAsciiTitles(documents: readonly DiscoveryDocument[]): void {
	for (const doc of documents) {
		if (!/^[\x20-\x7E]*$/.test(doc.title)) {
			throw new Error(`@iefa/agent-web: título de documento de descoberta precisa ser ASCII (header HTTP não carrega UTF-8): "${doc.title}" em ${doc.path}`)
		}
	}
}
