/**
 * Carga das fontes de um turno: banco + Storage → {@link TurnSources}.
 *
 * **Falha de leitura nunca vira fonte vazia.** Um `select` que falha e cai em `[]` faria o
 * modelo afirmar, com toda a convicção, que o processo "não tem achados" — a mesma armadilha
 * que, no parecer, já gravou aprovação sobre execução com BLOQUEANTE. Aqui toda leitura
 * confere `error` e lança {@link SourceLoadError}; a rota responde 502 antes de abrir o SSE.
 *
 * O texto dos documentos passa por um cache próprio, e não pelo de `api/submissions.ts`: o
 * chat precisa da árvore de seções (`nodes`) além do texto — é o que torna `[D1:3.2]`
 * conferível e `ler_secao` possível.
 */

import { SUBMISSION_BUCKET } from "../api/submission-bucket.ts"
import { supabase } from "../db/supabase.ts"
import { type SubmissionText, toSubmissionText } from "../extraction/to-text.ts"
import { TextCache } from "../lib/text-cache.ts"
import { CHAT_ATTACHMENT_BUCKET } from "./attachment-bucket.ts"
import {
	type DocumentSource,
	type FindingRow,
	type FindingSource,
	labelFindings,
	type ReviewSource,
	type SectionNode,
	type TurnSources,
	type VerificationState,
} from "./sources.ts"

export class SourceLoadError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "SourceLoadError"
	}
}

/** Texto + árvore, pelo caminho no Storage (o arquivo nunca é regravado: `upsert: false`). */
const documents = new TextCache<{ text: string; nodes: SectionNode[] }>(
	32,
	8 * 1024 * 1024,
	(value) => value.text.length + value.nodes.reduce((total, node) => total + node.body.length + node.title.length, 0)
)

/** Só o que o chat usa de cada nó — descarta notas e placeholders do modelo AGU. */
export function toSections(submissionText: SubmissionText): { text: string; nodes: SectionNode[] } {
	return {
		text: submissionText.text,
		nodes: submissionText.nodes.map((node) => ({ path: node.path, level: node.level, title: node.title, body: node.body })),
	}
}

/** Semeia o cache com um documento que acabou de ser lido (o upload de anexo já o converte). */
export function rememberDocument(bucket: string, storagePath: string, value: { text: string; nodes: SectionNode[] }): void {
	documents.set(`${bucket}/${storagePath}`, value)
}

async function loadDocument(bucket: string, storagePath: string, mimeType: string): Promise<{ text: string; nodes: SectionNode[] }> {
	const key = `${bucket}/${storagePath}`
	const cached = documents.get(key)
	if (cached) return cached

	const { data, error } = await supabase.storage.from(bucket).download(storagePath)
	if (error || !data) throw new SourceLoadError(`download de ${JSON.stringify(storagePath)} falhou: ${error?.message ?? "sem conteúdo"}`)

	const value = toSections(await toSubmissionText(new Uint8Array(await data.arrayBuffer()), mimeType))
	documents.set(key, value)
	return value
}

export async function loadProcessSources(submissionId: string): Promise<Extract<TurnSources, { mode: "processo" }>> {
	const { data: submission, error } = await supabase
		.from("submission")
		.select("id, filename, doc_kind, modalidade, objeto, storage_path, mime_type")
		.eq("id", submissionId)
		.maybeSingle()
	if (error) throw new SourceLoadError(`submissão não lida: ${error.message}`)
	if (!submission) throw new SourceLoadError("submissão inexistente")

	const [document, runResult] = await Promise.all([
		loadDocument(SUBMISSION_BUCKET, submission.storage_path, submission.mime_type),
		supabase
			.from("compliance_run")
			.select("id, status, rules_not_assessed, finished_at")
			.eq("submission_id", submissionId)
			.order("started_at", { ascending: false })
			.limit(1)
			.maybeSingle(),
	])
	if (runResult.error) throw new SourceLoadError(`execução não lida: ${runResult.error.message}`)

	// Só a execução MAIS RECENTE vale — a mesma regra da etapa do processo (`aci/queue.ts`):
	// uma reexecução em andamento ou que falhou não deixa os achados antigos valendo.
	const run = runResult.data
	let verification: VerificationState = { kind: "none" }
	let findings: FindingSource[] = []
	let review: ReviewSource | null = null

	if (run?.status === "running") verification = { kind: "running" }
	if (run?.status === "failed") verification = { kind: "failed" }
	if (run?.status === "succeeded") {
		verification = { kind: "succeeded", finished_at: run.finished_at, rules_not_assessed: run.rules_not_assessed ?? 0 }

		const [findingsResult, reviewResult] = await Promise.all([
			supabase
				.from("compliance_finding")
				.select("id, severity, category, status, section_path, message, legal_ref, suggestion, triage, triage_note")
				.eq("run_id", run.id),
			supabase
				.from("compliance_review")
				.select("decision, notes, created_at")
				.eq("run_id", run.id)
				.order("created_at", { ascending: false })
				.limit(1)
				.maybeSingle(),
		])
		if (findingsResult.error) throw new SourceLoadError(`achados não lidos: ${findingsResult.error.message}`)
		if (reviewResult.error) throw new SourceLoadError(`parecer não lido: ${reviewResult.error.message}`)

		findings = labelFindings((findingsResult.data ?? []) as FindingRow[])
		review = (reviewResult.data as ReviewSource | null) ?? null
	}

	return {
		mode: "processo",
		meta: { doc_kind: submission.doc_kind, modalidade: submission.modalidade, objeto: submission.objeto, filename: submission.filename },
		documents: [{ label: "D1", name: submission.filename, ...document }],
		verification,
		findings,
		review,
	}
}

export type AttachmentRow = { id: string; storage_path: string; filename: string; mime_type: string }

export async function loadAttachmentSources(threadId: string): Promise<Extract<TurnSources, { mode: "avulso" }>> {
	const { data, error } = await supabase
		.from("chat_attachment")
		.select("id, storage_path, filename, mime_type")
		.eq("thread_id", threadId)
		.order("created_at", { ascending: true })
	if (error) throw new SourceLoadError(`anexos não lidos: ${error.message}`)

	// A ordem de envio dá o rótulo: o D2 de hoje é o D2 de amanhã, e o histórico continua
	// apontando para o arquivo certo — até alguém apagar um anexo do meio, e aí os rótulos
	// antigos do histórico deixam de valer (o histórico vai ao modelo sem rótulos).
	const rows = (data ?? []) as AttachmentRow[]
	const loaded = await Promise.all(rows.map((row) => loadDocument(CHAT_ATTACHMENT_BUCKET, row.storage_path, row.mime_type)))
	const docs: DocumentSource[] = rows.map((row, index) => ({ label: `D${index + 1}`, name: row.filename, ...loaded[index] }))

	return { mode: "avulso", documents: docs }
}
