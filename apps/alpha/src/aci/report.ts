/**
 * Relatório final de conformidade (Etapa 1.8).
 *
 * É o documento que sai da plataforma: o que a máquina achou, o que o analista
 * acatou ou descartou, e o parecer. Renderizado em Markdown porque é o formato
 * que vai para o processo (SIGADAER, e-mail, anexo) sem depender da tela.
 *
 * Puro: recebe o retrato já lido do banco e não consulta nada.
 */

import { SEVERITY_ORDER, type Severity } from "../compliance/severity.ts"
import type { Decision, Triage } from "./queue.ts"
import type { ReviewSnapshot } from "./review.ts"

export interface ReportFinding {
	id: string
	category: string
	status: string
	severity: Severity
	section_path: string | null
	message: string
	legal_ref: Array<{ norma: string; dispositivo: string }>
	suggestion: string | null
	evidence_span: { text?: string } | null
	confidence: number | null
	triage: Triage
	triage_note: string | null
}

export interface ReportReview {
	id: string
	decision: Decision
	notes: string | null
	reviewer_id: string
	created_at: string
	/** Parecer gravado antes da versão com `findings` no retrato não tem a lista. */
	snapshot?: Partial<ReviewSnapshot> | null
}

export interface ReportDocument {
	id: string
	title: string
	document_type: string
	version_label: string | null
}

export interface FinalReport {
	run: {
		id: string
		status: string
		rules_applied: number
		rules_not_assessed: number
		discarded_findings: number
		started_at: string
		finished_at: string | null
	}
	submission: {
		id: string
		filename: string
		doc_kind: string
		modalidade: string | null
		objeto: string | null
		created_at: string
	}
	extraction: { id: string; model: string; created_at: string } | null
	model_document: ReportDocument | null
	law_documents: ReportDocument[]
	findings: ReportFinding[]
	/** Mais recente primeiro. O primeiro é o parecer vigente. */
	reviews: ReportReview[]
}

export const DECISION_LABEL: Record<Decision, string> = {
	aprovado: "Aprovado",
	aprovado_com_ressalvas: "Aprovado com ressalvas",
	reprovado: "Reprovado",
}

const CATEGORY_LABEL: Record<string, string> = {
	ESTRUTURAL: "Estrutura",
	CONTEUDO: "Conteúdo",
	CRUZADA: "Checagem cruzada",
}

function formatDate(iso: string | null): string {
	if (!iso) return "—"
	return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
}

/**
 * Texto de uma linha só.
 *
 * Mensagem de achado, sugestão, motivo e nome de arquivo entram no Markdown
 * como conteúdo, nunca como estrutura: uma quebra de linha seguida de `## `
 * dentro de uma mensagem gerada pelo modelo (ou de um nome de arquivo) viraria
 * um título falso — e um título falso num parecer é um parecer falso.
 */
function inline(text: string): string {
	return text.replace(/\s*[\r\n]+\s*/g, " ").trim()
}

/**
 * Texto de várias linhas (a fundamentação do parecer), sem virar estrutura.
 *
 * Linha que começa por marcador de bloco ganha a barra de escape do Markdown.
 */
function block(text: string): string {
	return text
		.trim()
		.split(/\r?\n/)
		.map((line) => (/^\s*[#>]/.test(line) ? line.replace(/^(\s*)/, "$1\\") : line))
		.join("\n")
}

/** Ordena por severidade e, dentro dela, pela seção — para o relatório ler na ordem do documento. */
export function sortFindings(findings: readonly ReportFinding[]): ReportFinding[] {
	return [...findings].sort((left, right) => {
		const bySeverity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
		if (bySeverity !== 0) return bySeverity
		return (left.section_path ?? "").localeCompare(right.section_path ?? "")
	})
}

export interface ResolvedFindings {
	findings: ReportFinding[]
	/** Achados cuja triagem atual difere da gravada no parecer vigente. */
	retriaged_after_review: number
}

/**
 * A triagem que o relatório mostra.
 *
 * Com parecer emitido, vale a triagem gravada no retrato do parecer — é o que o
 * analista assinou. Triagem mudada DEPOIS não reescreve o documento; ela é
 * contada e declarada, para o leitor saber que o estado atual difere do
 * assinado. Sem parecer (ou parecer antigo sem a lista), vale a triagem atual.
 */
export function resolveFindings(findings: readonly ReportFinding[], review: ReportReview | null): ResolvedFindings {
	const snapshot = review?.snapshot?.findings
	if (!snapshot) return { findings: [...findings], retriaged_after_review: 0 }

	const signed = new Map(snapshot.map((item) => [item.id, item]))
	let retriaged = 0
	const resolved = findings.map((finding) => {
		const at = signed.get(finding.id)
		if (!at) return finding
		if (at.triage !== finding.triage) retriaged += 1
		return { ...finding, triage: at.triage, triage_note: at.triage_note }
	})

	return { findings: resolved, retriaged_after_review: retriaged }
}

function renderFinding(finding: ReportFinding): string {
	const lines: string[] = []
	const where = finding.section_path ? ` · seção ${inline(finding.section_path)}` : ""
	lines.push(`#### [${finding.severity}] ${CATEGORY_LABEL[finding.category] ?? finding.category}${where}`)
	lines.push("")
	lines.push(inline(finding.message))
	if (finding.legal_ref.length > 0) {
		lines.push("")
		lines.push(`Fundamento: ${finding.legal_ref.map((ref) => `${inline(ref.dispositivo)} — ${inline(ref.norma)}`).join("; ")}`)
	}
	if (finding.evidence_span?.text) {
		lines.push("")
		lines.push(`> ${inline(finding.evidence_span.text)}`)
	}
	if (finding.suggestion) {
		lines.push("")
		lines.push(`Sugestão: ${inline(finding.suggestion)}`)
	}
	if (finding.triage === "descartado" && finding.triage_note) {
		lines.push("")
		lines.push(`Motivo do descarte: ${inline(finding.triage_note)}`)
	}
	lines.push("")
	return lines.join("\n")
}

/**
 * O relatório em Markdown.
 *
 * Achado sem triagem entra numa seção própria, nunca some: relatório que omite
 * o que o analista não olhou apresenta análise parcial como completa. A
 * cobertura da execução (regras aplicadas, não avaliadas, descartadas pelo
 * guard) vem sempre — é o que a Etapa 1.7 promete e o que o leitor precisa
 * para saber o que o relatório NÃO cobre.
 */
export function renderReportMarkdown(report: FinalReport): string {
	const review = report.reviews[0] ?? null
	const { findings: resolved, retriaged_after_review } = resolveFindings(report.findings, review)
	const sorted = sortFindings(resolved)
	const accepted = sorted.filter((finding) => finding.triage === "acatado")
	const discarded = sorted.filter((finding) => finding.triage === "descartado")
	const pending = sorted.filter((finding) => finding.triage === null)
	const filename = inline(report.submission.filename)

	const out: string[] = []
	out.push(`# Relatório de conformidade — ${report.submission.doc_kind} · ${filename}`)
	out.push("")
	out.push(`Parecer: **${review ? DECISION_LABEL[review.decision] : "não emitido"}**${review ? ` (${formatDate(review.created_at)})` : ""}`)
	out.push("")
	if (review?.notes) {
		out.push(block(review.notes))
		out.push("")
	}
	if (retriaged_after_review > 0) {
		out.push(
			`Atenção: ${retriaged_after_review} achado(s) tiveram a triagem alterada depois da emissão do parecer. Este relatório mostra a triagem no momento da emissão.`
		)
		out.push("")
	}

	out.push("## Identificação")
	out.push("")
	out.push(`- Documento: ${filename} (${report.submission.doc_kind})`)
	if (report.submission.objeto) out.push(`- Natureza do objeto: ${report.submission.objeto}`)
	if (report.submission.modalidade) out.push(`- Modalidade: ${inline(report.submission.modalidade)}`)
	out.push(`- Submetido em: ${formatDate(report.submission.created_at)}`)
	out.push(`- Execução: ${report.run.id} · ${formatDate(report.run.started_at)}`)
	if (report.extraction) out.push(`- Extração: ${report.extraction.id} · modelo ${inline(report.extraction.model)}`)
	out.push("")

	out.push("## Referências usadas")
	out.push("")
	out.push(
		report.model_document
			? `- Modelo AGU: ${inline(report.model_document.title)}${report.model_document.version_label ? ` (${inline(report.model_document.version_label)})` : ""}`
			: "- Modelo AGU: nenhum modelo aplicável — comparação estrutural não executada"
	)
	if (report.law_documents.length === 0) out.push("- Legislação: nenhuma norma vigente registrada na execução")
	for (const law of report.law_documents) {
		out.push(`- ${law.document_type}: ${inline(law.title)}${law.version_label ? ` (${inline(law.version_label)})` : ""}`)
	}
	out.push("")

	out.push("## Cobertura da análise")
	out.push("")
	out.push(`- Regras aplicadas: ${report.run.rules_applied}`)
	out.push(`- Regras não avaliadas: ${report.run.rules_not_assessed}`)
	out.push(`- Achados descartados pelo guard de citação: ${report.run.discarded_findings}`)
	out.push(
		`- Achados apresentados: ${sorted.length} (${accepted.length} acatados, ${discarded.length} descartados pelo analista, ${pending.length} sem triagem)`
	)
	out.push("")

	out.push(`## Achados acatados (${accepted.length})`)
	out.push("")
	if (accepted.length === 0) out.push("Nenhum achado acatado.")
	else for (const finding of accepted) out.push(renderFinding(finding))
	out.push("")

	if (pending.length > 0) {
		out.push(`## Achados sem triagem (${pending.length})`)
		out.push("")
		out.push("Os achados abaixo foram apontados pela verificação automática e ainda não receberam decisão do analista.")
		out.push("")
		for (const finding of pending) out.push(renderFinding(finding))
		out.push("")
	}

	out.push(`## Achados descartados pelo analista (${discarded.length})`)
	out.push("")
	if (discarded.length === 0) out.push("Nenhum.")
	else for (const finding of discarded) out.push(renderFinding(finding))
	out.push("")

	if (report.reviews.length > 1) {
		out.push("## Histórico de pareceres")
		out.push("")
		for (const item of report.reviews) {
			out.push(`- ${formatDate(item.created_at)} — ${DECISION_LABEL[item.decision]}${item.notes ? `: ${inline(item.notes)}` : ""}`)
		}
		out.push("")
	}

	out.push("---")
	out.push("")
	out.push("A verificação automática aponta; a palavra final é do gestor. Este relatório reflete a legislação e os modelos vigentes na data da execução.")
	out.push("")

	return out.join("\n")
}
