/**
 * Rotas da Plataforma ACI (Etapa 1.8).
 *
 * A fila, o processo, a triagem de achado, o parecer e o relatório final.
 * Tudo que já existia (submissão, extração, execução) continua nas rotas de
 * origem — aqui entra só a camada do analista sobre elas.
 *
 * Perfil: a fila é de quem enxerga o fluxo inteiro (`hasBroadAccess`). Triagem
 * e parecer são só `app_aci` — pelo desenho do projeto, o ACI é o único com
 * poder de aprovação final.
 *
 * Toda leitura confere `error`. Nesta camada, "sem dados" nunca é o fallback
 * de "a consulta falhou": a fila com zero achados, o relatório com zero
 * achados e o parecer emitido sobre zero achados são todos documentos que
 * mentem — e o último fica gravado para sempre.
 */

import { zValidator } from "@hono/zod-validator"
import type { User } from "@supabase/supabase-js"
import { Hono } from "hono"
import { z } from "zod"
import { buildQueue, DECISIONS, deriveStage, type QueueRow, type RunStatus, summarizeQueue } from "../aci/queue.ts"
import { type FinalReport, type ReportDocument, type ReportFinding, type ReportReview, renderReportMarkdown, resolveFindings } from "../aci/report.ts"
import { blockersByDecision, decisionBlockers, reviewSnapshot, type TriagedFinding } from "../aci/review.ts"
import { supabase } from "../db/supabase.ts"
import type { AppRole } from "../middleware/auth.ts"
import { requireRole } from "../middleware/auth.ts"
import { canReadComplianceRun, canReadSubmission, hasBroadAccess } from "./authorize.ts"
import { FINDING_COLUMNS, REVIEW_COLUMNS, RUN_COLUMNS } from "./columns.ts"

type Variables = { user: User; role: AppRole }

/** Processos lidos para a fila. Acima disso a fila vira paginação, e ainda não é o caso. */
const QUEUE_LIMIT = 200

const TriageBodySchema = z.object({
	triage: z.enum(["acatado", "descartado"]).nullable(),
	note: z.string().max(2000).optional(),
})

const ReviewBodySchema = z.object({
	decision: z.enum(DECISIONS),
	notes: z.string().max(10_000).optional(),
})

const ReportQuerySchema = z.object({
	format: z.enum(["json", "md"]).optional(),
})

/** Colunas de `compliance_finding` que o retrato do parecer e a regra de emissão usam. */
const TRIAGE_COLUMNS = "id, severity, triage, triage_note"

function failed(c: { json: (body: unknown, status: 500) => Response }, code: string) {
	return c.json({ error: "Internal Server Error", code }, 500)
}

async function loadTriagedFindings(runId: string): Promise<TriagedFinding[] | null> {
	const { data, error } = await supabase.from("compliance_finding").select(TRIAGE_COLUMNS).eq("run_id", runId)
	if (error) {
		console.error(`[aci] achados da execução ${runId} não lidos: ${error.message}`)
		return null
	}
	return (data ?? []) as TriagedFinding[]
}

export const aciRoutes = new Hono<{ Variables: Variables }>()
	// GET /api/v1/aci/queue — todos os processos, com etapa e o que pede atenção
	.get("/api/v1/aci/queue", async (c) => {
		// A fila é a visão de quem revisa. Requisitante tem a própria lista em
		// `GET /submissions`; abrir a fila para ele seria expor o documento alheio.
		if (!hasBroadAccess(c.get("role"))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		// Uma linha por submissão, agregada no banco — ver o comentário da RPC na
		// migration: a versão em app transferia todos os achados e esbarrava no
		// teto de 1000 linhas do PostgREST sem erro.
		const { data, error } = await supabase.rpc("aci_queue", { p_limit: QUEUE_LIMIT })
		if (error) {
			console.error(`[aci] fila não lida: ${error.message}`)
			return failed(c, "QUEUE_FAILED")
		}

		const items = buildQueue((data ?? []) as QueueRow[])
		return c.json({ items, totals: summarizeQueue(items), _links: { self: { href: "/api/v1/aci/queue" } } })
	})

	// GET /api/v1/aci/processes/:id — o processo inteiro: extrações, execuções e pareceres
	//
	// Nome próprio, e não `GET /submissions/:id`: este é o agregado do analista,
	// não o recurso "submissão". O detalhe simples da submissão, se um dia
	// existir, mora em `submissions.ts` e não pode colidir com este.
	.get("/api/v1/aci/processes/:id", async (c) => {
		const id = c.req.param("id")

		if (!(await canReadSubmission(id, c.get("user"), c.get("role")))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const { data: submission, error } = await supabase
			.from("submission")
			.select("id, user_id, filename, doc_kind, modalidade, objeto, mime_type, created_at")
			.eq("id", id)
			.maybeSingle()

		if (error) return failed(c, "SUBMISSION_LOOKUP_FAILED")
		if (!submission) return c.json({ error: "Not Found", code: "SUBMISSION_NOT_FOUND" }, 404)

		const [extractions, runs] = await Promise.all([
			supabase.from("extraction").select("id, model, created_at").eq("submission_id", id).order("created_at", { ascending: false }),
			supabase.from("compliance_run").select(RUN_COLUMNS).eq("submission_id", id).order("started_at", { ascending: false }),
		])
		if (extractions.error) return failed(c, "EXTRACTIONS_FAILED")
		if (runs.error) return failed(c, "RUNS_FAILED")

		const runIds = (runs.data ?? []).map((row) => row.id)
		const reviews =
			runIds.length === 0
				? { data: [], error: null }
				: await supabase.from("compliance_review").select(REVIEW_COLUMNS).in("run_id", runIds).order("created_at", { ascending: false })
		if (reviews.error) return failed(c, "REVIEWS_FAILED")

		const latestRun = runs.data?.[0] ?? null
		const latestReviewed = latestRun ? (reviews.data ?? []).some((review) => review.run_id === latestRun.id) : false

		return c.json({
			submission,
			// Derivada aqui, com a mesma função da fila — a tela não recalcula.
			stage: deriveStage((extractions.data ?? []).length > 0, (latestRun?.status as RunStatus | undefined) ?? null, latestReviewed),
			extractions: extractions.data ?? [],
			runs: runs.data ?? [],
			reviews: reviews.data ?? [],
			_links: { self: { href: `/api/v1/aci/processes/${id}` } },
		})
	})

	// PATCH /api/v1/compliance/findings/:id — triagem do analista
	.patch("/api/v1/compliance/findings/:id", requireRole(["app_aci"]), zValidator("json", TriageBodySchema), async (c) => {
		const id = c.req.param("id")
		const { triage, note } = c.req.valid("json")
		const user = c.get("user")

		// Descartar sem motivo tira do relatório um achado que a máquina fundamentou
		// em dispositivo real. O motivo é o que torna o descarte auditável.
		if (triage === "descartado" && !note?.trim()) {
			return c.json({ error: "Bad Request", code: "TRIAGE_NOTE_REQUIRED", message: "descartar um achado exige o motivo" }, 400)
		}

		const { data, error } = await supabase
			.from("compliance_finding")
			.update({
				triage,
				triage_note: triage === null ? null : (note?.trim() ?? null),
				triaged_by: triage === null ? null : user.id,
				triaged_at: triage === null ? null : new Date().toISOString(),
			})
			.eq("id", id)
			.select(FINDING_COLUMNS)
			.maybeSingle()

		if (error) return failed(c, "TRIAGE_FAILED")
		if (!data) return c.json({ error: "Not Found", code: "FINDING_NOT_FOUND" }, 404)

		return c.json(data)
	})

	// GET /api/v1/compliance/runs/:id/reviews — histórico de pareceres + o que a
	// emissão checaria AGORA (retrato atual e bloqueios por decisão)
	.get("/api/v1/compliance/runs/:id/reviews", async (c) => {
		const id = c.req.param("id")
		if (!(await canReadComplianceRun(id, c.get("user"), c.get("role")))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const [reviews, findings] = await Promise.all([
			supabase.from("compliance_review").select(REVIEW_COLUMNS).eq("run_id", id).order("created_at", { ascending: false }),
			loadTriagedFindings(id),
		])
		if (reviews.error) return failed(c, "REVIEWS_FAILED")
		if (findings === null) return failed(c, "FINDINGS_FAILED")

		const snapshot = reviewSnapshot(findings)
		return c.json({
			run_id: id,
			reviews: reviews.data ?? [],
			current: { snapshot: { ...snapshot, findings: undefined }, blockers: blockersByDecision(snapshot) },
			_links: { self: { href: `/api/v1/compliance/runs/${id}/reviews` } },
		})
	})

	// POST /api/v1/compliance/runs/:id/reviews — emite o parecer (linha nova, nunca update)
	.post("/api/v1/compliance/runs/:id/reviews", requireRole(["app_aci"]), zValidator("json", ReviewBodySchema), async (c) => {
		const id = c.req.param("id")
		const { decision, notes } = c.req.valid("json")
		const user = c.get("user")

		const { data: run, error } = await supabase.from("compliance_run").select("id, status").eq("id", id).maybeSingle()
		if (error) return failed(c, "RUN_LOOKUP_FAILED")
		if (!run) return c.json({ error: "Not Found", code: "RUN_NOT_FOUND" }, 404)
		if (run.status !== "succeeded") {
			return c.json(
				{ error: "Conflict", code: "RUN_NOT_SUCCEEDED", message: `a execução está "${run.status}" — parecer só sobre execução concluída`, status: run.status },
				409
			)
		}

		// Falha aqui NÃO vira "sem achados": seria emitir parecer sem ler.
		const findings = await loadTriagedFindings(id)
		if (findings === null) return failed(c, "FINDINGS_FAILED")

		const snapshot = reviewSnapshot(findings)
		const blockers = decisionBlockers(snapshot, decision)
		if (blockers.length > 0) {
			// `message` legível: o portal exibe `message ?? code`, e o analista precisa
			// saber O QUE falta triar, não só que algo bloqueou.
			return c.json({ error: "Conflict", code: "DECISION_BLOCKED", message: blockers.join("; "), blockers }, 409)
		}

		const { data: review, error: insertError } = await supabase
			.from("compliance_review")
			.insert({ run_id: id, reviewer_id: user.id, decision, notes: notes?.trim() || null, snapshot })
			.select(REVIEW_COLUMNS)
			.single()

		if (insertError) {
			// O trigger `compliance_review_guard` repete a regra dentro do insert e
			// levanta `check_violation` (23514) com o motivo em `details` — é a
			// corrida entre a checagem acima e uma triagem concorrente. Mesma
			// resposta que a checagem do app, para a tela reagir igual.
			if (insertError.code === "23514") {
				const code = insertError.message.includes("RUN_NOT_SUCCEEDED") ? "RUN_NOT_SUCCEEDED" : "DECISION_BLOCKED"
				const message = insertError.details || "os achados mudaram durante a emissão — confira a triagem e tente de novo"
				return c.json({ error: "Conflict", code, message, blockers: [message] }, 409)
			}
			console.error(`[aci] parecer da execução ${id} não gravado: ${insertError.message}`)
			return failed(c, "REVIEW_PERSIST_FAILED")
		}

		return c.json(review, 201)
	})

	// GET /api/v1/compliance/runs/:id/report — relatório final (JSON ou Markdown)
	.get("/api/v1/compliance/runs/:id/report", zValidator("query", ReportQuerySchema), async (c) => {
		const id = c.req.param("id")
		const { format } = c.req.valid("query")

		if (!(await canReadComplianceRun(id, c.get("user"), c.get("role")))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const { data: run, error } = await supabase.from("compliance_run").select(RUN_COLUMNS).eq("id", id).maybeSingle()
		if (error) return failed(c, "RUN_LOOKUP_FAILED")
		if (!run) return c.json({ error: "Not Found", code: "RUN_NOT_FOUND" }, 404)

		const documentIds = [...(run.model_document_id ? [run.model_document_id] : []), ...(run.law_document_ids ?? [])]

		const [submission, extraction, findings, reviews, documents] = await Promise.all([
			supabase.from("submission").select("id, filename, doc_kind, modalidade, objeto, created_at").eq("id", run.submission_id).maybeSingle(),
			supabase.from("extraction").select("id, model, created_at").eq("id", run.extraction_id).maybeSingle(),
			supabase.from("compliance_finding").select(FINDING_COLUMNS).eq("run_id", id),
			supabase.from("compliance_review").select(REVIEW_COLUMNS).eq("run_id", id).order("created_at", { ascending: false }),
			documentIds.length === 0
				? Promise.resolve({ data: [], error: null })
				: supabase.from("document").select("id, title, document_type, version_label").in("id", documentIds),
		])

		// Este é o documento que sai do sistema como arquivo: nenhuma leitura
		// pode virar "zero achados" ou "parecer não emitido" por falha de consulta.
		if (submission.error) return failed(c, "SUBMISSION_LOOKUP_FAILED")
		if (!submission.data) return c.json({ error: "Not Found", code: "SUBMISSION_NOT_FOUND" }, 404)
		if (extraction.error) return failed(c, "EXTRACTION_LOOKUP_FAILED")
		if (findings.error) return failed(c, "FINDINGS_FAILED")
		if (reviews.error) return failed(c, "REVIEWS_FAILED")
		if (documents.error) return failed(c, "DOCUMENTS_FAILED")

		const allDocuments = (documents.data ?? []) as ReportDocument[]
		const reviewRows = (reviews.data ?? []) as ReportReview[]
		const resolved = resolveFindings((findings.data ?? []) as ReportFinding[], reviewRows[0] ?? null)

		const report: FinalReport = {
			run,
			submission: submission.data,
			extraction: extraction.data ?? null,
			model_document: allDocuments.find((document) => document.id === run.model_document_id) ?? null,
			law_documents: allDocuments.filter((document) => document.id !== run.model_document_id),
			findings: resolved.findings,
			reviews: reviewRows,
		}

		if (format === "md") {
			return c.text(renderReportMarkdown(report), 200, {
				"Content-Type": "text/markdown; charset=utf-8",
				"Content-Disposition": `attachment; filename="relatorio-conformidade-${id}.md"`,
			})
		}

		return c.json({
			...report,
			retriaged_after_review: resolved.retriaged_after_review,
			_links: { self: { href: `/api/v1/compliance/runs/${id}/report` }, markdown: { href: `/api/v1/compliance/runs/${id}/report?format=md` } },
		})
	})
