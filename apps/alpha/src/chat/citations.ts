/**
 * Citações do chat: o modelo cita por rótulo, o servidor confere cada rótulo contra o que o
 * turno REALMENTE entregou, e só o que confere chega à tela.
 *
 * Rótulos:
 *   [N3]      trecho do corpus devolvido por `buscar_norma` neste turno
 *   [A2]      achado da execução carregada neste turno
 *   [D1]      documento/anexo do turno
 *   [D1:3.2]  seção 3.2 desse documento (tem de existir na árvore)
 *
 * Rótulo sem fonte SOME do texto e entra na contagem de descartados — nunca aparece como
 * link quebrado nem como fonte inventada. Foi o erro do `toReferences` do ChatRADA, que
 * fabricava "Trecho N" com texto que o regulamento nunca teve.
 *
 * Citação literal — aspas imediatamente antes de um `[D…]` — é procurada no texto da fonte.
 * Não achou: `located: false`, e a tela diz "trecho não localizado no documento" em vez de
 * apresentá-la como citação.
 *
 * Puro de propósito.
 */

import { locateEvidence } from "../compliance/evidence.ts"
import type { DocumentSource, FindingSource } from "./sources.ts"

export interface NormaEntry {
	label: string
	chunk_id: string
	/** Nome do documento de origem, como o retriever o conhece (pode faltar no corpus federal). */
	source: string | null
}

export type Citation =
	| { label: string; kind: "norma"; ref: string; source: string | null }
	| { label: string; kind: "achado"; ref: string; severity: string; message: string }
	| { label: string; kind: "documento"; ref: string; document: string; path: string | null; section_title: string | null; quote?: string; located?: boolean }

export interface TurnCatalog {
	normas: ReadonlyMap<string, NormaEntry>
	findings: readonly FindingSource[]
	documents: readonly DocumentSource[]
}

export interface ResolvedCitations {
	content: string
	citations: Citation[]
	dropped: number
}

const LABEL = String.raw`(?:N\d+|A\d+|D\d+(?::\d+(?:\.\d+)*)?)`

/** `[N1]`, e também `[N1, N2]` / `[N1; A3]` — o modelo agrupa com frequência. */
const LABEL_GROUP = new RegExp(String.raw` ?\[(${LABEL}(?:\s*[,;]\s*${LABEL})*)\]`, "g")

/** Bloco de redação sugerida: texto que o usuário vai COLAR no documento oficial. */
const REDACTION_BLOCK = /```redacao[\s\S]*?(?:```|$)/g

/** Aspas imediatamente antes do rótulo: a citação literal que ele sustenta. */
const TRAILING_QUOTE = /[“"]([^“”"]{8,600})[”"]\s*[,.;:]?\s*$/

const QUOTE_LOOKBEHIND = 700

/** Tira todo rótulo do texto — para o histórico reenviado ao modelo e para o bloco de redação. */
export function stripCitationLabels(text: string): string {
	return text.replace(LABEL_GROUP, "")
}

export function resolveCitations(text: string, catalog: TurnCatalog): ResolvedCitations {
	const findingsByLabel = new Map(catalog.findings.map((finding) => [finding.label, finding]))
	const documentsByLabel = new Map(catalog.documents.map((doc) => [doc.label, doc]))
	const citations = new Map<string, Citation>()
	let dropped = 0

	// Dentro do bloco de redação, rótulo nenhum: ele iria parar no ETP/TR colado pelo usuário.
	const withoutRedactionLabels = text.replace(REDACTION_BLOCK, (block) => stripCitationLabels(block))

	const resolveOne = (label: string, precedingText: string): Citation | null => {
		const existing = citations.get(label)
		if (existing && existing.kind !== "documento") return existing

		if (label.startsWith("N")) {
			const norma = catalog.normas.get(label)
			return norma ? { label, kind: "norma", ref: norma.chunk_id, source: norma.source } : null
		}
		if (label.startsWith("A")) {
			const finding = findingsByLabel.get(label)
			return finding ? { label, kind: "achado", ref: finding.id, severity: finding.severity, message: finding.message } : null
		}

		const [docLabel, path = null] = label.split(":") as [string, string | undefined]
		const doc = documentsByLabel.get(docLabel)
		if (!doc) return null
		const node = path === null ? null : doc.nodes.find((candidate) => candidate.path === path)
		if (path !== null && !node) return null

		const citation: Citation =
			existing?.kind === "documento" ? existing : { label, kind: "documento", ref: doc.label, document: doc.name, path, section_title: node?.title ?? null }
		const quote = TRAILING_QUOTE.exec(precedingText)?.[1]?.trim()
		// O mesmo rótulo pode sustentar mais de uma citação literal. Basta UMA não localizada
		// para a marca cair — mostrar "localizado" pela primeira esconderia a segunda.
		if (quote && citation.located !== false) {
			const located = locateEvidence({ status: "INCONFORME", evidence: quote }, doc.text) !== null
			if (!located || citation.quote === undefined) {
				citation.quote = quote
				citation.located = located
			}
		}
		return citation
	}

	const content = withoutRedactionLabels.replace(LABEL_GROUP, (match, group: string, offset: number) => {
		const precedingText = withoutRedactionLabels.slice(Math.max(0, offset - QUOTE_LOOKBEHIND), offset)
		const kept: string[] = []
		for (const raw of group.split(/[,;]/)) {
			const label = raw.trim()
			const citation = resolveOne(label, precedingText)
			if (!citation) {
				dropped += 1
				continue
			}
			citations.set(label, citation)
			if (!kept.includes(label)) kept.push(label)
		}
		if (kept.length === 0) return ""
		const leadingSpace = match.startsWith(" ") ? " " : ""
		return `${leadingSpace}${kept.map((label) => `[${label}]`).join("")}`
	})

	return { content, citations: [...citations.values()], dropped }
}
