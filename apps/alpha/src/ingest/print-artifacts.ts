/**
 * @module print-artifacts
 * Remoção de cabeçalho, rodapé e número de página do texto extraído de PDF.
 *
 * ─── Por que isto existe ──────────────────────────────────────────────────────
 * O RADA-e é material feito para ser impresso: cada página repete o título do
 * módulo no topo, o número da página, e — em 26 dos 92 documentos — um carimbo
 * `Documento: … - Página X/Y - Hash MD5: <hex>`. Nada disso é norma. Medido no
 * acervo, era 6,8% de todos os caracteres extraídos, presente em 86% dos chunks.
 *
 * O estrago não é estético. O cabeçalho repetido é o TÍTULO DO MÓDULO, e ele
 * aparecia em metade dos chunks daquele módulo: puxa todo vetor do documento
 * para o mesmo ponto e degrada exatamente a discriminação entre chunks do mesmo
 * manual, que é a que a busca precisa. O carimbo é pior — hex de MD5 é token sem
 * significado nenhum disputando espaço no vetor. E o número de página cai NO MEIO
 * do dispositivo, porque a extração concatena as páginas.
 *
 * ─── Por que por repetição, e não por regex de documento ──────────────────────
 * Uma lista de expressões por manual seria 92 casos para manter, e o próximo
 * módulo coletado chegaria sujo em silêncio. O que define cabeçalho não é o texto
 * dele: é ele estar na BORDA da página e se repetir ao longo do documento. Essa
 * é a regra implementada, e ela pega as cinco famílias de artefato de uma vez.
 *
 * ─── A página que sai inteira ─────────────────────────────────────────────────
 * Vinte e cinco documentos terminam numa página de CONTROLE DE ASSINATURAS
 * ELETRÔNICAS: hash, data/hora, contagem de páginas e quem assinou. Não é linha
 * repetida — é uma página inteira de metadado do sistema de assinatura, e escapava
 * da regra de repetição justamente por aparecer uma vez só.
 *
 * ─── O que isto deliberadamente NÃO faz ───────────────────────────────────────
 * Linha repetida no MEIO da página fica. Um `Início` (voltar-ao-topo) no fim de
 * uma subseção, ou o `clicar aqui` de um link morto, são texto do documento onde
 * estão — removê-los mutilaria a frase. Só a borda é tratada, porque só na borda
 * a repetição prova origem de impressão.
 *
 * Módulo PURO: sem `env.ts`, sem supabase. É a parte que erra, então é a parte
 * que precisa de teste.
 */
import { cleanText } from "../lib/text.ts"

/**
 * Quantas linhas de cada extremidade da página são candidatas.
 *
 * Quatro porque o pior caso do acervo empilha carimbo + título do módulo +
 * subtítulo + número da página. Passar disso começaria a alcançar o primeiro
 * parágrafo de páginas curtas.
 */
const EDGE_LINES = 4

/** Abaixo disto não há repetição que prove nada — um documento de 2 páginas passa inteiro. */
const MIN_PAGES = 3

/** Fração das páginas em que a linha precisa aparecer para ser considerada de impressão. */
const REPEAT_RATIO = 0.4

/**
 * Teto de tamanho do que pode ser descartado.
 *
 * Cabeçalho é curto; o mais longo do acervo tem ~130 caracteres (o carimbo com o
 * MD5). Um parágrafo que se repita na borda de metade das páginas é mais
 * provavelmente texto do que artefato, e na dúvida o texto fica.
 */
const MAX_ARTIFACT_CHARS = 200

/**
 * Cabeçalho da página de controle de assinatura eletrônica.
 *
 * Vinte e cinco documentos do acervo terminam numa página que é só isto: hash,
 * data/hora de criação, contagem de páginas e a lista de quem assinou. Não é
 * cabeçalho repetido — é uma página inteira de metadado do sistema de assinatura,
 * e por isso escapa da regra de repetição. É também a origem de TODO o resíduo de
 * `Hash MD5` que sobrava depois da limpeza.
 *
 * Exigido no INÍCIO da linha, e não em qualquer lugar da página: assim uma norma
 * que fale sobre controle de assinaturas no meio de um parágrafo não perde a página.
 */
const SIGNATURE_PAGE_HEADING = /^CONTROLE DE ASSINATURAS? ELETR[ÔO]NICAS?\b/i

/**
 * Carimbo de página do sistema de documento eletrônico do COMAER.
 *
 * `Documento: <título> - Página X/Y - Hash MD5: <hex>`. Vale por forma, sem depender
 * de repetição, porque a forma já é prova: título, paginação e hash na mesma linha não
 * existem em texto normativo. É o que alcança os dez submódulos de 2 páginas do Módulo
 * H, curtos demais para que a repetição prove qualquer coisa.
 */
const DOCUMENT_STAMP = /^Documento:\s.*\sP[áa]gina\s*\d+\s*\/\s*\d+\s.*Hash\s+MD\d?:/i

/** Rótulo da página de assinatura no relatório — ela não tem "máscara", sai inteira. */
const SIGNATURE_PAGE_PATTERN = "<página de controle de assinatura>"

/** Padrões de número de página isolado, na borda da página. */
const PAGE_NUMBER_PATTERNS = [
	/^\d{1,4}$/,
	/^[-–—]\s*\d{1,4}\s*[-–—]$/,
	/^\d{1,4}\s*\/\s*\d{1,4}$/,
	/^(?:p[áa]g(?:\.|ina)?|fl(?:s?\.|\.)?|folha)\s*n?[º°o]?\s*[.:]?\s*\d{1,4}(?:\s*(?:\/|de)\s*\d{1,4})?$/i,
]

/**
 * Iguala "Página 3/47" e "Página 4/47", que são a MESMA linha de rodapé.
 *
 * Sem mascarar o dígito, a contagem por repetição não enxerga nenhum rodapé que
 * numere página — que é a maioria deles.
 */
function maskDigits(line: string): string {
	return line.replace(/\d+/g, "#")
}

function isPageNumber(line: string): boolean {
	return PAGE_NUMBER_PATTERNS.some((pattern) => pattern.test(line))
}

/** O que sai da borda por forma própria, sem precisar da prova de repetição. */
function isPrintStampByShape(line: string): boolean {
	return isPageNumber(line) || DOCUMENT_STAMP.test(line)
}

function isSignaturePage(lines: string[]): boolean {
	return lines.some((line) => SIGNATURE_PAGE_HEADING.test(line))
}

function isEdge(index: number, total: number): boolean {
	return index < EDGE_LINES || index >= total - EDGE_LINES
}

export interface StripResult {
	/** Texto do documento, uma linha por linha mantida. */
	text: string
	/** Quantas linhas foram descartadas — o número que o `rada:build` reporta. */
	removedLines: number
	/** As máscaras descartadas, da mais frequente para a menos, para conferência humana. */
	patterns: string[]
}

/**
 * Junta as páginas descartando o que só faz sentido no papel.
 *
 * @param pages - Texto de cada página, na ordem. É por isso que a extração precisa
 *   de `mergePages: false`: sem a fronteira de página não existe "borda", e nada
 *   aqui seria decidível.
 */
export function stripPrintArtifacts(pages: string[]): StripResult {
	const perPage = pages.map((page) =>
		page
			.split(/\r?\n/)
			.map((line) => cleanText(line))
			.filter(Boolean)
	)
	// Página de assinatura sai inteira, e sai ANTES da contagem: ela não é página do
	// documento, e deixá-la no denominador só empurraria o limiar de repetição para cima.
	const signaturePages = perPage.filter(isSignaturePage)
	const removedBySignature = signaturePages.reduce((total, lines) => total + lines.length, 0)
	const body = perPage.map((lines) => (isSignaturePage(lines) ? [] : lines))
	const nonEmpty = body.filter((lines) => lines.length > 0)

	if (nonEmpty.length < MIN_PAGES) {
		// Documento curto demais para a repetição provar algo — mas o que tem forma
		// própria de artefato ainda sai. Dez submódulos do Módulo H caem aqui.
		const patterns = signaturePages.length > 0 ? [SIGNATURE_PAGE_PATTERN] : []
		let removedByShape = 0
		const short = body.map((lines) =>
			lines.filter((line, index) => {
				if (!isEdge(index, lines.length) || !isPrintStampByShape(line)) return true
				removedByShape++
				patterns.push(maskDigits(line))
				return false
			})
		)
		return { text: short.flat().join("\n"), removedLines: removedBySignature + removedByShape, patterns }
	}

	// Conta PÁGINAS, não ocorrências: um cabeçalho que aparecesse três vezes numa
	// página só e em nenhuma outra não é cabeçalho.
	const pagesByMask = new Map<string, number>()
	for (const lines of body) {
		const masks = new Set<string>()
		for (const [index, line] of lines.entries()) {
			if (isEdge(index, lines.length) && line.length <= MAX_ARTIFACT_CHARS) masks.add(maskDigits(line))
		}
		for (const mask of masks) pagesByMask.set(mask, (pagesByMask.get(mask) ?? 0) + 1)
	}

	const threshold = Math.max(MIN_PAGES, Math.ceil(nonEmpty.length * REPEAT_RATIO))
	const repeated = new Set([...pagesByMask].filter(([, count]) => count >= threshold).map(([mask]) => mask))

	const removedByMask = new Map<string, number>()
	const kept: string[] = []
	for (const lines of body) {
		for (const [index, line] of lines.entries()) {
			const removable = isEdge(index, lines.length) && line.length <= MAX_ARTIFACT_CHARS
			if (removable && (repeated.has(maskDigits(line)) || isPrintStampByShape(line))) {
				const mask = maskDigits(line)
				removedByMask.set(mask, (removedByMask.get(mask) ?? 0) + 1)
				continue
			}
			kept.push(line)
		}
	}

	const patterns = [...removedByMask].sort((a, b) => b[1] - a[1]).map(([mask]) => mask)
	if (signaturePages.length > 0) patterns.push(SIGNATURE_PAGE_PATTERN)

	return {
		text: kept.join("\n"),
		removedLines: [...removedByMask.values()].reduce((total, count) => total + count, 0) + removedBySignature,
		patterns,
	}
}
