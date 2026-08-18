/**
 * Execução de conformidade — junta as Etapas 1.5, 1.6 e 1.7.
 *
 * A execução registra a extração, o modelo AGU e todas as versões de norma que
 * usou. É o que permite reabrir um parecer meses depois e obter exatamente o
 * mesmo resultado, mesmo que o modelo e a lei já tenham mudado.
 */

import { SUBMISSION_BUCKET } from "../api/submission-bucket.ts"
import { supabase } from "../db/supabase.ts"
import type { Contratacao } from "../extraction/schema.ts"
import { toSubmissionText } from "../extraction/to-text.ts"
import { runCrossChecks } from "./cross-checks.ts"
import { matchSections, type SectionFinding, toComparable } from "./match-sections.ts"
import { LegalRefResolver } from "./resolve-legal-ref.ts"
import { type ObjetoTipo, selectApplicableModel } from "./select-model.ts"
import { compareSeverity, type Severity, structuralSeverity } from "./severity.ts"
import { applyCitationGuard, blockForRule, isApplicable, judgeRule, loadActiveRules } from "./verify.ts"

/** Quantas regras são julgadas em paralelo. */
const RULE_CONCURRENCY = 4

export interface FindingRow {
	rule_id: string | null
	category: "ESTRUTURAL" | "CONTEUDO" | "CRUZADA"
	status: "MISSING" | "EXTRA" | "OUT_OF_ORDER" | "RENAMED" | "INCONFORME"
	severity: Severity
	section_path: string | null
	message: string
	legal_ref: unknown
	suggestion: string | null
	evidence_span: unknown
	confidence: number | null
}

export interface RunSummary {
	run_id: string
	rules_applied: number
	rules_not_assessed: number
	discarded_findings: number
	model_document_id: string | null
	model_reason?: string
	law_document_ids: string[]
	findings: FindingRow[]
}

async function loadSubmissionSections(submissionId: string) {
	const { data: submission } = await supabase
		.from("submission")
		.select("storage_path, mime_type, doc_kind, modalidade, objeto")
		.eq("id", submissionId)
		.maybeSingle()

	if (!submission) throw new Error("submissão não encontrada")

	const { data: download } = await supabase.storage.from(SUBMISSION_BUCKET).download(submission.storage_path)
	if (!download) throw new Error("arquivo da submissão indisponível")

	const { nodes } = await toSubmissionText(new Uint8Array(await download.arrayBuffer()), submission.mime_type)
	return { submission, nodes }
}

async function loadModelSections(modelDocumentId: string) {
	const { data, error } = await supabase.from("structure_node").select("path, ordinal, title, is_required").eq("document_id", modelDocumentId).order("ordinal")

	if (error) throw new Error(`leitura da estrutura do modelo falhou: ${error.message}`)
	return (data ?? []) as Array<{ path: string; ordinal: number; title: string; is_required: boolean }>
}

/** Ids das normas vigentes usadas na verificação, para gravar na execução. */
async function currentLawDocumentIds(): Promise<string[]> {
	const { data } = await supabase.from("document").select("id").in("document_type", ["LEI", "DECRETO", "IN_SEGES"]).is("superseded_at", null)

	return ((data ?? []) as Array<{ id: string }>).map((row) => row.id)
}

function structuralFindings(sections: SectionFinding[]): FindingRow[] {
	return sections
		.map((section): FindingRow | null => {
			const severity = structuralSeverity(section.status, section.is_required)
			// MATCHED não vira achado — só divergência entra no relatório.
			if (!severity || section.status === "MATCHED") return null

			const message =
				section.status === "MISSING"
					? `Seção do modelo ausente no documento: "${section.model_title}".`
					: section.status === "EXTRA"
						? `Seção sem correspondente no modelo: "${section.document_title}".`
						: section.status === "OUT_OF_ORDER"
							? `Seção "${section.document_title}" aparece fora da ordem do modelo.`
							: `Seção "${section.document_title}" corresponde a "${section.model_title}" com redação diferente.`

			return {
				rule_id: null,
				category: "ESTRUTURAL" as const,
				status: section.status,
				severity,
				section_path: section.document_path ?? section.model_path ?? null,
				message,
				legal_ref: [],
				suggestion: section.status === "MISSING" ? `Incluir a seção "${section.model_title}", prevista no modelo oficial.` : null,
				evidence_span: null,
				confidence: section.similarity ?? null,
			}
		})
		.filter((finding): finding is FindingRow => finding !== null)
}

/** Executa as regras em lotes, para não abrir uma chamada por regra ao mesmo tempo. */
async function inBatches<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = []
	for (let offset = 0; offset < items.length; offset += size) {
		results.push(...(await Promise.all(items.slice(offset, offset + size).map(worker))))
	}
	return results
}

export async function runCompliance(submissionId: string, extractionId: string): Promise<RunSummary> {
	const { data: extraction } = await supabase.from("extraction").select("payload, spans").eq("id", extractionId).maybeSingle()
	if (!extraction) throw new Error("extração não encontrada")

	const payload = extraction.payload as Contratacao
	const { submission, nodes } = await loadSubmissionSections(submissionId)
	const selection = await selectApplicableModel(submission.doc_kind, (submission.objeto as ObjetoTipo | null) ?? null)
	const lawIds = await currentLawDocumentIds()

	const { data: run, error: runError } = await supabase
		.from("compliance_run")
		.insert({
			submission_id: submissionId,
			extraction_id: extractionId,
			model_document_id: selection.model?.id ?? null,
			law_document_ids: lawIds,
			status: "running",
		})
		.select("id")
		.single()

	if (runError || !run) throw new Error(`criação da execução falhou: ${runError?.message}`)

	const findings: FindingRow[] = []
	let notAssessed = 0
	let discarded = 0

	try {
		// Etapa 1.5 — estrutural. Sem modelo aplicável, é pulada e o motivo fica
		// registrado; a verificação de conteúdo segue normalmente.
		if (selection.model) {
			const modelSections = toComparable(await loadModelSections(selection.model.id))
			findings.push(...structuralFindings(await matchSections(modelSections, toComparable(nodes))))
		}

		// Etapa 1.6 — regras ativas aplicáveis.
		const resolver = new LegalRefResolver()
		const rules = (await loadActiveRules()).filter((rule) => isApplicable(rule, { modalidade: submission.modalidade, objeto: submission.objeto }))

		const verdicts = await inBatches(rules, RULE_CONCURRENCY, async (rule) => {
			const block = blockForRule(rule, payload)
			if (!block) return { rule, verdict: null }
			return { rule, verdict: await judgeRule(rule, block) }
		})

		for (const { rule, verdict } of verdicts) {
			if (!verdict || verdict.status === "NAO_AVALIADA") {
				notAssessed += 1
				continue
			}
			if (verdict.status === "CONFORME") continue

			const guard = await applyCitationGuard(verdict, resolver)
			if (!guard.kept) {
				discarded += 1
				continue
			}

			findings.push({
				rule_id: rule.id,
				category: rule.kind === "ESTRUTURAL" ? "ESTRUTURAL" : rule.kind,
				status: "INCONFORME",
				severity: rule.severity,
				section_path: rule.target_field,
				message: verdict.message,
				legal_ref: guard.resolved_refs,
				suggestion: verdict.suggestion,
				evidence_span: verdict.evidence ? { text: verdict.evidence } : null,
				confidence: verdict.confidence,
			})
		}

		// Etapa 1.7 — checagens cruzadas.
		for (const check of runCrossChecks(payload)) {
			if (check.status === "NAO_AVALIADA") {
				notAssessed += 1
				continue
			}
			if (check.status === "CONFORME") continue

			findings.push({
				rule_id: null,
				category: "CRUZADA",
				status: "INCONFORME",
				severity: check.severity,
				section_path: check.fields.join(", "),
				message: check.message,
				legal_ref: check.legal_ref,
				suggestion: check.suggestion ?? null,
				evidence_span: null,
				confidence: null,
			})
		}

		findings.sort((left, right) => compareSeverity(left.severity, right.severity))

		if (findings.length > 0) {
			const { error } = await supabase.from("compliance_finding").insert(findings.map((finding) => ({ ...finding, run_id: run.id })))
			if (error) throw new Error(`gravação de achados falhou: ${error.message}`)
		}

		await supabase
			.from("compliance_run")
			.update({
				status: "succeeded",
				rules_applied: rules.length,
				rules_not_assessed: notAssessed,
				discarded_findings: discarded,
				finished_at: new Date().toISOString(),
			})
			.eq("id", run.id)

		return {
			run_id: run.id,
			rules_applied: rules.length,
			rules_not_assessed: notAssessed,
			discarded_findings: discarded,
			model_document_id: selection.model?.id ?? null,
			model_reason: selection.reason,
			law_document_ids: lawIds,
			findings,
		}
	} catch (error) {
		await supabase.from("compliance_run").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", run.id)
		throw error
	}
}
