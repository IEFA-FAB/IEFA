/**
 * Adapter das fontes de legislação federal.
 *
 * **Sobre a fonte primária.** O design previa LexML/SRU como primária e o
 * Planalto como fallback. Ao rodar contra os servidores reais, o LexML
 * (`lexml.gov.br/busca/SRU`) responde com uma página de verificação de
 * segurança do Senado em vez de XML — não é utilizável a partir de servidor.
 * O Planalto responde e serve o texto compilado, então é ele a primária de
 * lei e decreto; o DOU (`in.gov.br`) serve as instruções normativas.
 *
 * Uma norma tem uma única "versão" observável: o texto compilado de hoje. O
 * versionamento vem do hash do conteúdo — quando o Planalto publica alteração,
 * o hash muda, entra versão nova e a anterior é marcada como superseded.
 */

import type { FederalDocumentType, NormativeSourceAdapter, SourceItem, StructuredDoc } from "../types.ts"
import { decodeHtml, htmlToNormalizedText } from "./html-text.ts"
import { parseArticulado } from "./parse-articulado.ts"

const USER_AGENT = "Mozilla/5.0 (compatible; iefa-alpha/1.0; +https://portal.iefa.com.br)"

/** Piso de sanidade por norma — abaixo disso o HTML mudou de forma. */
const MIN_EXPECTED_ARTICLES = 5

export interface LegislacaoSourceConfig {
	id: string
	documentType: FederalDocumentType
	title: string
	/** URL do texto compilado. */
	url: string
	effectiveFrom?: string
}

async function sha256(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer)
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function createLegislacaoAdapter(config: LegislacaoSourceConfig): NormativeSourceAdapter {
	return {
		id: config.id,

		async discover(): Promise<SourceItem[]> {
			return [
				{
					external_id: config.url,
					title: config.title,
					// Substituído pelo hash em `parse`: o texto compilado não traz
					// rótulo de versão, só muda de conteúdo quando é alterado.
					version_label: "compilado",
					effective_from: config.effectiveFrom,
					fetch_url: config.url,
				},
			]
		},

		async fetch(item: SourceItem) {
			const response = await fetch(item.fetch_url, { headers: { "User-Agent": USER_AGENT } })
			if (!response.ok) throw new Error(`GET ${item.fetch_url} → ${response.status}`)
			return new Uint8Array(await response.arrayBuffer())
		},

		async parse(raw: Uint8Array, item: SourceItem): Promise<StructuredDoc> {
			const nodes = parseArticulado(htmlToNormalizedText(decodeHtml(raw)))
			const articles = nodes.filter((node) => node.level === 1).length

			if (articles < MIN_EXPECTED_ARTICLES) {
				throw new Error(`${config.id}: ${articles} artigo(s) reconhecido(s) em ${item.fetch_url} — provável mudança de estrutura da página`)
			}

			const contentHash = await sha256(raw)

			return {
				document_type: config.documentType,
				title: config.title,
				version_label: `compilado-${contentHash.slice(0, 12)}`,
				effective_from: config.effectiveFrom,
				content_hash: contentHash,
				nodes,
			}
		},
	}
}

/**
 * Normas do corpus mínimo de contratações.
 *
 * Só entra aqui norma cuja URL foi verificada respondendo. Acrescentar uma
 * norma é acrescentar uma linha aqui e uma linha no registry do banco.
 */
export const LEGISLACAO_SOURCES: LegislacaoSourceConfig[] = [
	{
		id: "lei-14133",
		documentType: "LEI",
		title: "Lei nº 14.133, de 1º de abril de 2021",
		url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm",
		effectiveFrom: "2021-04-01",
	},
	{
		id: "in-seges-65-2021",
		documentType: "IN_SEGES",
		title: "Instrução Normativa SEGES/ME nº 65, de 7 de julho de 2021 — pesquisa de preços",
		url: "https://www.in.gov.br/en/web/dou/-/instrucao-normativa-seges-/me-n-65-de-7-de-julho-de-2021-330673635",
		effectiveFrom: "2021-07-07",
	},
]
