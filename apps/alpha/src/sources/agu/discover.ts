/**
 * Descoberta dos modelos da Lei 14.133/21 publicados pela AGU.
 *
 * A página de cada categoria é HTML gerado por CMS; o que interessa nela são os
 * `href` terminados em `.docx`. Três armadilhas reais, todas tratadas aqui:
 *
 * 1. Uma categoria lista arquivos de **outras** categorias — a categoria real
 *    vem do caminho da URL do arquivo, não da página em que ele foi encontrado.
 * 2. O mesmo arquivo aparece em vários `<a>` (um deles frequentemente vazio,
 *    outro só com "(Dezembro/2025)").
 * 3. A página lista **versões antigas ao lado da vigente** (`...-set-25.docx` e
 *    `...-abr-26.docx` do mesmo modelo). Só a mais nova é ingerida; as demais
 *    são registradas no relatório, nunca descartadas em silêncio.
 */

import type { SourceItem } from "../types.ts"
import { parseVersionFromUrl, stripVersionFromUrl } from "./version.ts"

/** Piso de sanidade: abaixo disso, presume-se que a página mudou de estrutura. */
export const MIN_EXPECTED_MODELS = 10

/**
 * Rótulo temporário para arquivo cujo nome não traz o sufixo de mês/ano.
 * O adapter substitui pelo prefixo do hash do conteúdo, já que só depois de
 * baixar dá para identificar a versão.
 */
export const UNVERSIONED_LABEL = "sem-versao"

/**
 * Categorias ignoradas na ingestão.
 *
 * "Modelos Antigos e Registros de Alteração" existe como arquivo histórico da
 * AGU — 47 modelos revogados. Ingeri-los como vigentes faria a comparação
 * estrutural conferir documento novo contra modelo revogado, que é pior do que
 * não conferir.
 */
export const EXCLUDED_CATEGORIES = new Set(["modelos-antigos"])

const DOCX_ANCHOR = /<a\b[^>]*\bhref="([^"]+\.docx)"[^>]*>([\s\S]*?)<\/a>/gi
const CATEGORY_LINK = /<a\b[^>]*\bhref="([^"]+)"/gi
const HTML_TAG = /<[^>]+>/g

export interface DiscoverReport {
	items: SourceItem[]
	/** Versões antigas encontradas e não ingeridas. */
	supersededByNewer: Array<{ external_id: string; version_label: string }>
	/** Arquivos ignorados por estarem em categoria excluída. */
	excluded: Array<{ fetch_url: string; category: string }>
	categoriesVisited: string[]
}

type Fetcher = (url: string) => Promise<string>

const defaultFetcher: Fetcher = async (url) => {
	const response = await fetch(url, { headers: { "User-Agent": "iefa-alpha/1.0 (+https://portal.iefa.com.br)" } })
	if (!response.ok) throw new Error(`GET ${url} → ${response.status}`)
	return response.text()
}

/**
 * Texto de um trecho de HTML.
 *
 * Remover `<[^>]+>` uma vez não basta, por dois motivos: tag aninhada
 * (`<<b>script>`) pode virar tag válida depois da primeira passada, e tag sem
 * fechamento (`<script` no fim do trecho) simplesmente não casa e sobrevive
 * inteira. Daí o laço até estabilizar e a remoção do que restar de `<`/`>`.
 *
 * Importa porque este texto vira título de documento no corpus, e o corpus é
 * lido de volta em telas e em prompt de modelo — o que sai daqui é texto, não
 * marcação, independente de quão malformado era o HTML da AGU.
 */
function stripTags(html: string): string {
	let stripped = html
	for (let previous = ""; previous !== stripped; ) {
		previous = stripped
		stripped = stripped.replace(HTML_TAG, "")
	}

	return stripped
		.replace(/[<>]/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim()
}

/** Título a partir do nome do arquivo, quando o texto do link não serve. */
function titleFromUrl(url: string): string {
	const slug =
		url
			.split("/")
			.pop()
			?.replace(/\.docx$/i, "") ?? url
	const words = slug.replace(/-lei-no-14-133.*$/, "").split("-")
	return words.map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(" ")
}

function categoryFromUrl(baseUrl: string, url: string): string | undefined {
	if (!url.startsWith(baseUrl)) return undefined
	const rest = url.slice(baseUrl.length).replace(/^\//, "")
	const segments = rest.split("/")
	return segments.length > 1 ? segments[0] : undefined
}

/** Links de categoria da página índice: mesmo prefixo, sem extensão de arquivo. */
function extractCategoryUrls(html: string, baseUrl: string): string[] {
	const urls = new Set<string>()
	CATEGORY_LINK.lastIndex = 0
	let match = CATEGORY_LINK.exec(html)
	while (match) {
		const href = match[1]
		if (href.startsWith(`${baseUrl}/`) && !/\.\w{2,5}(?:$|\?)/.test(href)) {
			urls.add(href.replace(/[?#].*$/, "").replace(/\/$/, ""))
		}
		match = CATEGORY_LINK.exec(html)
	}
	return [...urls]
}

function extractDocxAnchors(html: string): Array<{ url: string; text: string }> {
	const anchors: Array<{ url: string; text: string }> = []
	DOCX_ANCHOR.lastIndex = 0
	let match = DOCX_ANCHOR.exec(html)
	while (match) {
		anchors.push({ url: match[1], text: stripTags(match[2]) })
		match = DOCX_ANCHOR.exec(html)
	}
	return anchors
}

/** Escolhe, por identidade de modelo, a versão de maior rank. */
function keepNewestPerModel(candidates: SourceItem[]): { items: SourceItem[]; supersededByNewer: DiscoverReport["supersededByNewer"] } {
	const newest = new Map<string, { item: SourceItem; rank: number }>()
	const superseded: DiscoverReport["supersededByNewer"] = []

	for (const item of candidates) {
		const rank = parseVersionFromUrl(item.fetch_url)?.rank ?? 0
		const current = newest.get(item.external_id)

		if (!current) {
			newest.set(item.external_id, { item, rank })
			continue
		}
		if (rank > current.rank) {
			superseded.push({ external_id: current.item.external_id, version_label: current.item.version_label })
			newest.set(item.external_id, { item, rank })
		} else if (rank < current.rank) {
			superseded.push({ external_id: item.external_id, version_label: item.version_label })
		}
	}

	return { items: [...newest.values()].map((entry) => entry.item), supersededByNewer: superseded }
}

/**
 * Converte o HTML de uma ou mais páginas em itens de fonte.
 *
 * Exportada à parte de `discoverAguModels` para ser testável sem rede — os
 * testes alimentam o HTML real capturado em `__fixtures__/`.
 */
export function collectItemsFromHtml(pages: Array<{ url: string; html: string }>, baseUrl: string): DiscoverReport {
	const byUrl = new Map<string, SourceItem>()
	const excluded: DiscoverReport["excluded"] = []

	for (const page of pages) {
		for (const anchor of extractDocxAnchors(page.html)) {
			const existing = byUrl.get(anchor.url)

			// Mesmo arquivo em vários <a>: fica com o primeiro título não vazio.
			if (existing) {
				if (!existing.title.trim() && anchor.text) existing.title = anchor.text
				continue
			}

			const category = categoryFromUrl(baseUrl, anchor.url)
			if (category && EXCLUDED_CATEGORIES.has(category)) {
				if (!excluded.some((entry) => entry.fetch_url === anchor.url)) excluded.push({ fetch_url: anchor.url, category })
				continue
			}

			const version = parseVersionFromUrl(anchor.url)
			byUrl.set(anchor.url, {
				external_id: stripVersionFromUrl(anchor.url),
				title: anchor.text || titleFromUrl(anchor.url),
				version_label: version?.label ?? UNVERSIONED_LABEL,
				effective_from: version?.effective_from,
				fetch_url: anchor.url,
				category,
			})
		}
	}

	const deduped = keepNewestPerModel([...byUrl.values()])

	return {
		items: deduped.items.sort((a, b) => a.external_id.localeCompare(b.external_id)),
		supersededByNewer: deduped.supersededByNewer,
		excluded,
		categoriesVisited: pages.map((page) => page.url),
	}
}

/**
 * Percorre a página índice e as categorias dela, e devolve os modelos vigentes.
 *
 * Falha alto quando encontra menos que `MIN_EXPECTED_MODELS`: uma mudança de
 * estrutura no site da AGU se manifesta como "zero arquivos encontrados", e
 * tratar isso como sucesso marcaria como superseded todo o corpus vigente.
 */
export async function discoverAguModels(baseUrl: string, fetcher: Fetcher = defaultFetcher): Promise<DiscoverReport> {
	const indexHtml = await fetcher(baseUrl)
	const categoryUrls = extractCategoryUrls(indexHtml, baseUrl)

	const pages = [{ url: baseUrl, html: indexHtml }]
	for (const url of categoryUrls) {
		try {
			pages.push({ url, html: await fetcher(url) })
		} catch (error) {
			// Uma categoria fora do ar não invalida as demais; o piso de sanidade
			// abaixo é quem decide se o resultado ainda é utilizável.
			pages.push({ url, html: "" })
			if (process.env.DEBUG) console.error(`[agu] categoria falhou: ${url}`, error)
		}
	}

	const report = collectItemsFromHtml(pages, baseUrl)

	if (report.items.length < MIN_EXPECTED_MODELS) {
		throw new Error(
			`AGU: encontrados ${report.items.length} modelos (< ${MIN_EXPECTED_MODELS}) em ${pages.length} páginas — provável mudança de estrutura do site`
		)
	}

	return report
}
