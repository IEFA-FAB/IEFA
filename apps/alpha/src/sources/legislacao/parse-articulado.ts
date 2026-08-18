/**
 * Texto normalizado de norma → árvore de dispositivos.
 *
 * O que sai daqui é o que o **guard de citação** consulta: para descartar um
 * achado que cita "art. 6º, XXIII" da Lei 14.133, é preciso existir um nó com
 * exatamente esse `ref_label` na versão vigente.
 *
 * A segmentação é feita sobre o texto, não sobre as tags: o HTML do Planalto
 * quebra frases no meio de `<span>`, então qualquer parser guiado por elemento
 * perde a maioria dos artigos (na Lei 14.133, encontra 23 de 194).
 */

import { cleanText, normalizeTitle } from "../../lib/text.ts"
import type { StructureNodeDraft } from "../types.ts"

/**
 * Abertura de artigo: "Art. 6º", "Art. 44-A.", "Art. 191".
 *
 * A maiúscula é o que distingue abertura de referência — no corpo da norma, a
 * citação a outro dispositivo vem em minúscula ("na forma do art. 18").
 */
const ARTICLE_OPENING = /(?:^|(?<=[.;:!?"”\s]))Art\.\s*(\d+(?:-[A-Z])?)[º°]?\s*/g

/** Marcadores de agrupamento acima do artigo. */
const GROUPING = /\b(T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)\s+([IVXLCDM]+|[ÚU]NIC[AO])\b/g

/** "§ 1º", "§ 2o", "Parágrafo único". */
const PARAGRAFO = /(?:§\s*(\d+)[º°]?|Par[áa]grafo\s+[úu]nico)\s*[.\-–]?\s*/g

/**
 * "I - ", "XXIII – ".
 *
 * Precisa ser numeral isolado com travessão cercado de espaço. Ancorar no
 * ponto-e-vírgula anterior não funciona: o Planalto insere marcações de
 * vigência entre um inciso e o seguinte ("…(Vide Decreto nº 12.807, de 2025)
 * Vigência XXIII - termo de referência…"), e o inciso seguinte se perderia.
 */
const INCISO = /(?:^|\s)([IVXLCDM]{1,7})\s+[-–]\s+/g

/** "a)", "b)" — alínea dentro de inciso. */
const ALINEA = /(?:^|(?<=[;:.]\s))([a-z])\)\s*/g

export interface ArticuladoNode extends StructureNodeDraft {
	ref_label: string
}

interface Segment {
	label: string
	text: string
	start: number
}

/**
 * Fatia o texto nos pontos onde `pattern` casa.
 *
 * O conteúdo de um segmento vai do fim do próprio marcador até o **início do
 * marcador seguinte** — não até a próxima ocorrência do rótulo, que apareceria
 * também dentro do corpo e truncaria o dispositivo no lugar errado.
 */
function splitByRegex(text: string, pattern: RegExp, label: (match: RegExpExecArray) => string): Segment[] {
	const marks: Array<{ label: string; markStart: number; contentStart: number }> = []
	pattern.lastIndex = 0

	let match = pattern.exec(text)
	while (match) {
		marks.push({ label: label(match), markStart: match.index, contentStart: match.index + match[0].length })
		match = pattern.exec(text)
	}

	return marks.map((mark, index) => ({
		label: mark.label,
		start: mark.contentStart,
		text: cleanText(text.slice(mark.contentStart, index + 1 < marks.length ? marks[index + 1].markStart : text.length)),
	}))
}

/**
 * Rótulo canônico do artigo.
 *
 * A praxe legislativa brasileira usa ordinal até o 9 ("Art. 9º") e cardinal do
 * 10 em diante ("Art. 18"). Citar "art. 18º" não resolveria contra nada.
 */
export function articleLabel(numero: string): string {
	const base = Number.parseInt(numero, 10)
	return `Art. ${numero}${/^\d+$/.test(numero) && base <= 9 ? "º" : ""}`
}

/** Título curto do dispositivo, para exibição e casamento aproximado. */
function shortTitle(refLabel: string, body: string): string {
	const firstSentence = body.split(/(?<=\.)\s/)[0] ?? body
	const trimmed = firstSentence.length > 120 ? `${firstSentence.slice(0, 117)}…` : firstSentence
	return trimmed ? `${refLabel} ${trimmed}` : refLabel
}

function pushNode(nodes: ArticuladoNode[], node: Omit<ArticuladoNode, "ordinal">): void {
	nodes.push({ ...node, ordinal: nodes.length })
}

/**
 * Constrói a árvore de dispositivos.
 *
 * Nível 1 = artigo; nível 2 = parágrafo ou inciso do artigo; nível 3 = alínea.
 * O agrupamento (título/capítulo/seção) entra como `body` do artigo, e não como
 * nó próprio: o que precisa ser endereçável por citação é o dispositivo.
 */
export function parseArticulado(text: string): ArticuladoNode[] {
	const nodes: ArticuladoNode[] = []

	const groupings = splitByRegex(text, GROUPING, (match) => `${match[1]} ${match[2]}`)
	const groupingAt = (position: number): string | undefined => {
		let current: string | undefined
		for (const grouping of groupings) {
			if (grouping.start <= position) current = grouping.label
			else break
		}
		return current
	}

	const seenRefs = new Set<string>()
	const articles = splitByRegex(text, ARTICLE_OPENING, (match) => articleLabel(match[1])).filter((article) => {
		// Normas alteradas por esta lei aparecem transcritas no corpo dela (o
		// Código Penal, a Lei 8.987…), reusando números de artigo. Fica a primeira
		// ocorrência: é a do texto da própria norma sendo ingerida.
		if (seenRefs.has(article.label)) return false
		seenRefs.add(article.label)
		return true
	})

	for (const [index, article] of articles.entries()) {
		const refLabel = article.label
		const grouping = groupingAt(article.start)
		const articlePath = String(index + 1)

		// O artigo se divide em caput (até o primeiro §) e parágrafos. Incisos e
		// alíneas são lidos **dentro** de cada um desses blocos: um inciso do § 3º é
		// "Art. X, § 3º, I", e não "Art. X, I" — que é outro dispositivo.
		PARAGRAFO.lastIndex = 0
		const firstParagrafo = PARAGRAFO.exec(article.text)?.index ?? article.text.length
		const caputBlock = article.text.slice(0, firstParagrafo)

		INCISO.lastIndex = 0
		const caputEnd = INCISO.exec(caputBlock)?.index ?? caputBlock.length
		// O ponto que fecha "Art. 18." fica fora do marcador e abriria o caput.
		const caput = cleanText(caputBlock.slice(0, caputEnd)).replace(/^[.\s]+/, "")

		pushNode(nodes, {
			path: articlePath,
			level: 1,
			title: shortTitle(refLabel, caput),
			title_norm: normalizeTitle(caput || refLabel),
			ref_label: refLabel,
			is_required: true,
			body: grouping ? `[${grouping}] ${caput}` : caput,
			notes: [],
			placeholders: [],
		})

		let child = 0

		const emitIncisos = (block: string, parentRef: string, parentPath: string, parentLevel: number) => {
			let incisoIndex = 0
			for (const inciso of splitByRegex(block, INCISO, (match) => match[1])) {
				incisoIndex += 1
				const incisoRef = `${parentRef}, ${inciso.label}`
				const incisoPath = `${parentPath}.${incisoIndex}`

				pushNode(nodes, {
					path: incisoPath,
					level: parentLevel + 1,
					title: shortTitle(incisoRef, inciso.text),
					title_norm: normalizeTitle(inciso.text || inciso.label),
					ref_label: incisoRef,
					is_required: true,
					body: inciso.text,
					notes: [],
					placeholders: [],
				})

				let alineaIndex = 0
				for (const alinea of splitByRegex(inciso.text, ALINEA, (match) => match[1])) {
					alineaIndex += 1
					pushNode(nodes, {
						path: `${incisoPath}.${alineaIndex}`,
						level: parentLevel + 2,
						title: shortTitle(`${incisoRef}, "${alinea.label}"`, alinea.text),
						title_norm: normalizeTitle(alinea.text || alinea.label),
						ref_label: `${incisoRef}, "${alinea.label}"`,
						is_required: true,
						body: alinea.text,
						notes: [],
						placeholders: [],
					})
				}
			}
		}

		emitIncisos(caputBlock, refLabel, articlePath, 1)

		for (const paragrafo of splitByRegex(article.text, PARAGRAFO, (match) => (match[1] ? `§ ${match[1]}º` : "parágrafo único"))) {
			child += 1
			const paragrafoRef = `${refLabel}, ${paragrafo.label}`
			const paragrafoPath = `${articlePath}.${100 + child}`

			INCISO.lastIndex = 0
			const paragrafoCaput = cleanText(paragrafo.text.slice(0, INCISO.exec(paragrafo.text)?.index ?? paragrafo.text.length))

			pushNode(nodes, {
				path: paragrafoPath,
				level: 2,
				title: shortTitle(paragrafoRef, paragrafoCaput),
				title_norm: normalizeTitle(paragrafoCaput || paragrafo.label),
				ref_label: paragrafoRef,
				is_required: true,
				body: paragrafoCaput,
				notes: [],
				placeholders: [],
			})

			emitIncisos(paragrafo.text, paragrafoRef, paragrafoPath, 2)
		}
	}

	return nodes
}
