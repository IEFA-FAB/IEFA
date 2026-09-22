/**
 * Fontes de um turno do chat sobre documento, e o orçamento que decide quanto delas vai
 * inteiro ao modelo.
 *
 * Uma conversa de processo tem UM documento (o enviado), os achados da execução concluída
 * mais recente e o parecer vigente. Uma conversa avulsa tem os anexos. O motor não
 * distingue as duas além disso: tudo vira {@link TurnSources}, montado DO ZERO a cada
 * turno (`load-sources.ts`) — nada atravessa turnos além do histórico de mensagens.
 *
 * Puro de propósito: o teste confere o orçamento sem banco, Storage nem modelo.
 */

import { SEVERITY_ORDER, type Severity } from "../compliance/severity.ts"

/** Seção de um documento — a árvore que `toSubmissionText` devolve, sem os campos do modelo AGU. */
export interface SectionNode {
	/** Caminho decimal, ex.: `3.2.1`. É o que o modelo cita em `[D1:3.2.1]`. */
	path: string
	level: number
	title: string
	body: string
}

export interface DocumentSource {
	/** Rótulo citável: `D1`, `D2`… — a ordem é a de entrada, estável entre turnos. */
	label: string
	/** Nome exibido do arquivo (já saneado na gravação). */
	name: string
	text: string
	nodes: SectionNode[]
}

export interface FindingSource {
	/** Rótulo citável: `A1`, `A2`… na ordem de severidade. */
	label: string
	id: string
	severity: Severity
	category: string
	status: string
	section_path: string | null
	message: string
	legal_ref: Array<{ norma?: string; dispositivo?: string }>
	suggestion: string | null
	triage: "acatado" | "descartado" | null
	triage_note: string | null
}

export interface ReviewSource {
	decision: "aprovado" | "aprovado_com_ressalvas" | "reprovado"
	notes: string | null
	created_at: string
}

/** Estado da verificação do processo, como o chat precisa dizer ao modelo. */
export type VerificationState =
	| { kind: "none" }
	| { kind: "running" }
	| { kind: "failed" }
	| { kind: "succeeded"; finished_at: string | null; rules_not_assessed: number }

export interface ProcessMeta {
	doc_kind: string
	modalidade: string | null
	objeto: string | null
	filename: string
}

export type TurnSources =
	| {
			mode: "processo"
			meta: ProcessMeta
			documents: DocumentSource[]
			verification: VerificationState
			findings: FindingSource[]
			review: ReviewSource | null
	  }
	| { mode: "avulso"; documents: DocumentSource[] }

/** Texto de cada seção de nível 1 que entra no sumário de uma fonte grande demais. */
export const SUMMARY_SECTION_PREVIEW_CHARS = 1_500

export type BundledDocument =
	| { label: string; name: string; form: "full"; content: string }
	| { label: string; name: string; form: "summary"; content: string; totalChars: number }

export interface SourceBundle {
	documents: BundledDocument[]
	/** Alguma fonte foi como sumário — só então `ler_secao`/`buscar_no_documento` existem. */
	summarized: boolean
}

/**
 * Índice das seções com o caminho que o chat cita (`[D1:3.2]`).
 *
 * Vai também com o texto INTEGRAL, e não só no sumário: o caminho é o da árvore que
 * `toSubmissionText` monta (contadores por nível), e nem sempre coincide com a numeração
 * impressa — um parágrafo "220 V em corrente alternada" vira seção, e o "3. OBJETO" do texto
 * passa a ser o caminho 4. Sem o índice o modelo citava pela numeração que via, e a citação
 * resolvia para a seção errada (medido no e2e de 2026-09-22).
 */
export function outlineDocument(doc: DocumentSource): string {
	return doc.nodes.map((node) => `${"  ".repeat(Math.max(0, node.level - 1))}${node.path} ${oneLine(node.title).slice(0, 160)}`).join("\n")
}

/** Texto integral precedido do índice — o que vai ao modelo quando a fonte cabe no orçamento. */
export function fullDocument(doc: DocumentSource): string {
	if (doc.nodes.length === 0) return doc.text
	return `ÍNDICE DAS SEÇÕES (cite pelo caminho deste índice, que pode diferir da numeração do texto):\n${outlineDocument(doc)}\n\nTEXTO INTEGRAL:\n${doc.text}`
}

/**
 * Sumário estrutural de uma fonte: a árvore inteira (caminho, título, tamanho) e o começo
 * de cada seção de nível 1. Sem árvore (PDF sem numeração nenhuma), o começo do texto.
 */
export function summarizeDocument(doc: DocumentSource): string {
	if (doc.nodes.length === 0) {
		return `(documento sem seções reconhecíveis — ${doc.text.length} caracteres; use buscar_no_documento)\n\n${doc.text.slice(0, SUMMARY_SECTION_PREVIEW_CHARS * 2)}`
	}

	const outline = doc.nodes.map((node) => `${"  ".repeat(Math.max(0, node.level - 1))}${node.path} ${oneLine(node.title)} (${node.body.length} caracteres)`)
	const previews = doc.nodes
		.filter((node) => node.level === 1 && node.body.trim())
		.map(
			(node) =>
				`### ${node.path} ${oneLine(node.title)}\n${node.body.slice(0, SUMMARY_SECTION_PREVIEW_CHARS)}${node.body.length > SUMMARY_SECTION_PREVIEW_CHARS ? " […]" : ""}`
		)

	return [`SUMÁRIO (${doc.text.length} caracteres no total; leia a seção com ler_secao):`, ...outline, "", ...previews].join("\n")
}

/**
 * Decide, fonte a fonte, o que vai inteiro e o que vai como sumário.
 *
 * Guloso pela MENOR fonte: com um TR de 40 mil e um edital de 300 mil caracteres num teto
 * de 150 mil, o TR vai inteiro e só o edital resume — resumir os dois porque a soma passou
 * tiraria o texto de quem cabia. A ordem de apresentação continua a de entrada.
 */
export function buildSourceBundle(documents: readonly DocumentSource[], maxChars: number): SourceBundle {
	const fullLabels = new Set<string>()
	let remaining = maxChars
	for (const doc of [...documents].sort((a, b) => a.text.length - b.text.length)) {
		if (doc.text.length > remaining) break
		fullLabels.add(doc.label)
		remaining -= doc.text.length
	}

	const bundled = documents.map((doc): BundledDocument => {
		if (fullLabels.has(doc.label)) return { label: doc.label, name: doc.name, form: "full", content: fullDocument(doc) }
		return { label: doc.label, name: doc.name, form: "summary", content: summarizeDocument(doc), totalChars: doc.text.length }
	})

	return { documents: bundled, summarized: bundled.some((doc) => doc.form === "summary") }
}

function oneLine(text: string): string {
	return text.replace(/\s+/g, " ").trim()
}

export type FindingRow = {
	id: string
	severity: Severity
	category: string
	status: string
	section_path: string | null
	message: string
	legal_ref: Array<{ norma?: string; dispositivo?: string }> | null
	suggestion: string | null
	triage: "acatado" | "descartado" | null
	triage_note: string | null
}

/** Achados na ordem do relatório (severidade, depois seção), rotulados `A1`, `A2`… */
export function labelFindings(rows: readonly FindingRow[]): FindingSource[] {
	return [...rows]
		.sort(
			(a, b) =>
				SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.section_path ?? "").localeCompare(b.section_path ?? "", "pt-BR", { numeric: true })
		)
		.map((row, index) => ({ ...row, legal_ref: Array.isArray(row.legal_ref) ? row.legal_ref : [], label: `A${index + 1}` }))
}
