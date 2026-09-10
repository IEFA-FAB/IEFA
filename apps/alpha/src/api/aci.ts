/**
 * Rotas da Plataforma ACI (Etapa 1.8).
 *
 * A fila, o detalhe do processo, a triagem de achado, o parecer e o relatório
 * final. Tudo que já existia (submissão, extração, execução) continua nas
 * rotas de origem — aqui entra só a camada do analista sobre elas.
 *
 * Perfil: a fila é de quem enxerga o fluxo inteiro (`hasBroadAccess`). Triagem
 * e parecer são só `app_aci` — pelo desenho do projeto, o ACI é o único com
 * poder de aprovação final.
 */

import { zValidator } from "@hono/zod-validator"
import type { User } from "@supabase/supabase-js"
import { Hono } from "hono"
import { z } from "zod"
import { buildQueue, type QueueExtraction, type QueueFinding, type QueueReview, type QueueRun, type QueueSubmission, summarizeQueue } from "../aci/queue.ts"
import { type FinalReport, type ReportDocument, type ReportFinding, type ReportReview, renderReportMarkdown } from "../aci/report.ts"
import { DECISIONS, decisionBlockers, reviewSnapshot, type TriagedFinding } from "../aci/review.ts"
import { supabase } from "../db/supabase.ts"
import type { AppRole } from "../middleware/auth.ts"
import { requireRole } from "../middleware/auth.ts"
import { canReadComplianceRun, canReadSubmission, hasBroadAccess } from "./authorize.ts"

type Variables = { user: User; role: AppRole }

/** Processos lidos para a fila. Acima disso a fila vira paginação, e ainda não é o caso. */
const QUEUE_LIMIT = 200

const TriageBodySchema = z.object({
	triage: z.enum(["acatado", "descartado"]).nullable(),
	note: z.string().max(2000).optional(),
})

const ReviewBodySchema = z.object({
	decision: z.enum(DECISIONS as [string, ...string[]]).transform((value) => value as (typeof DECISIONS)[number]),
	notes: z.string().max(10_000).optional(),
})

const ReportQuerySchema = z.object({
	format: z.enum(["json", "md"]).optional(),
})

const FINDING_COLUMNS =
	"id, run_id, rule_id, category, status, severity, section_path, message, legal_ref, suggestion, evidence_span, confidence, triage, triage_note, triaged_by, triaged_at"

const RUN_COLUMNS =
	"id, submission_id, extraction_id, model_document_id, law_document_ids, status, rules_applied, rules_not_assessed, discarded_findings, started_at, finished_at"

async function loadDocuments(ids: string[]): Promise<ReportDocument[]> {
	if (ids.length === 0) return []
	const { data } = await supabase.from("document").select("id, title, document_type, version_label").in("id", ids)
	return (data ?? []) as ReportDocument[]
}

export const aciRoutes = new Hono<{ Variables: Variables }>()
	// GET /api/v1/aci/queue — todos os processos, com etapa e o que pede atenção
	.get("/api/v1/aci/queue", async (c) => {
		// A fila é a visão de quem revisa. Requisitante tem a própria lista em
		// `GET /submissions`; abrir a fila para ele seria expor o documento alheio.
		if (!hasBroadAccess(c.get("role"))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const { data: submissions, error } = await supabase
			.from("submission")
			.select("id, user_id, filename, doc_kind, modalidade, objeto, created_at")
			.order("created_at", { ascending: false })
			.limit(QUEUE_LIMIT)

		if (error) return c.json({ error: "Internal Server Error", code: "QUEUE_FAILED" }, 500)

		const submissionIds = (submissions ?? []).map((row) => row.id)
		if (submissionIds.length === 0) {
			return c.json({ items: [], totals: summarizeQueue([]), _links: { self: { href: "/api/v1/aci/queue" } } })
		}

		const [{ data: extractions }, { data: runs }] = await Promise.all([
			supabase.from("extraction").select("id, submission_id, created_at").in("submission_id", submissionIds),
			supabase
				.from("compliance_run")
				.select("id, submission_id, status, rules_applied, rules_not_assessed, discarded_findings, started_at, finished_at")
				.in("submission_id", submissionIds),
		])

		const runIds = (runs ?? []).map((row) => row.id)
		const [{ data: findings }, { data: reviews }] =
			runIds.length === 0
				? [{ data: [] }, { data: [] }]
				: await Promise.all([
						supabase.from("compliance_finding").select("run_id, severity, triage").in("run_id", runIds),
						supabase.from("compliance_review").select("run_id, decision, created_at").in("run_id", runIds),
					])

		const items = buildQueue({
			submissions: (submissions ?? []) as QueueSubmission[],
			extractions: (extractions ?? []) as QueueExtraction[],
			runs: (runs ?? []) as QueueRun[],
			findings: (findings ?? []) as QueueFinding[],
			reviews: (reviews ?? []) as QueueReview[],
		})

		return c.json({ items, totals: summarizeQueue(items), _links: { self: { href: "/api/v1/aci/queue" } } })
	})

	// GET /api/v1/submissions/:id — o processo inteiro: extrações, execuções e pareceres
	.get("/api/v1/submissions/:id", async (c) => {
		const id = c.req.param("id")

		if (!(await canReadSubmission(id, c.get("user"), c.get("role")))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const { data: submission, error } = await supabase
			.from("submission")
			.select("id, user_id, filename, doc_kind, modalidade, objeto, mime_type, created_at")
			.eq("id", id)
			.maybeSingle()

		if (error) return c.json({ error: "Internal Server Error", code: "SUBMISSION_LOOKUP_FAILED" }, 500)
		if (!submission) return c.json({ error: "Not Found", code: "SUBMISSION_NOT_FOUND" }, 404)

		const [{ data: extractions }, { data: runs }] = await Promise.all([
			supabase.from("extraction").select("id, model, created_at, payload").eq("submission_id", id).order("created_at", { ascending: false }),
			supabase.from("compliance_run").select(RUN_COLUMNS).eq("submission_id", id).order("started_at", { ascending: false }),
		])

		const runIds = (runs ?? []).map((row) => row.id)
		const { data: reviews } =
			runIds.length === 0
				? { data: [] }
				: await supabase
						.from("compliance_review")
						.select("id, run_id, decision, notes, reviewer_id, created_at")
						.in("run_id", runIds)
						.order("created_at", { ascending: false })

		// Só o resumo da extração: quantos campos vieram preenchidos. O payload
		// inteiro tem a tela própria (`/extractions`).
		const extractionSummaries = (extractions ?? []).map((row) => {
			const payload = (row.payload ?? {}) as Record<string, unknown>
			const keys = Object.keys(payload)
			return {
				id: row.id,
				model: row.model,
				created_at: row.created_at,
				fields_total: keys.length,
				fields_filled: keys.filter((key) => payload[key] !== null && payload[key] !== undefined).length,
			}
		})

		return c.json({
			submission,
			extractions: extractionSummaries,
			runs: runs ?? [],
			reviews: reviews ?? [],
			_links: { self: { href: `/api/v1/submissions/${id}` } },
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

		if (error) return c.json({ error: "Internal Server Error", code: "TRIAGE_FAILED" }, 500)
		if (!data) return c.json({ error: "Not Found", code: "FINDING_NOT_FOUND" }, 404)

		return c.json(data)
	})

	// GET /api/v1/compliance/runs/:id/reviews — histórico de pareceres
	.get("/api/v1/compliance/runs/:id/reviews", async (c) => {
		const id = c.req.param("id")
		if (!(await canReadComplianceRun(id, c.get("user"), c.get("role")))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const { data, error } = await supabase
			.from("compliance_review")
			.select("id, run_id, decision, notes, snapshot, reviewer_id, created_at")
			.eq("run_id", id)
			.order("created_at", { ascending: false })

		if (error) return c.json({ error: "Internal Server Error", code: "REVIEWS_FAILED" }, 500)
		return c.json({ run_id: id, reviews: data ?? [], _links: { self: { href: `/api/v1/compliance/runs/${id}/reviews` } } })
	})

	// POST /api/v1/compliance/runs/:id/reviews — emite o parecer (linha nova, nunca update)
	.post("/api/v1/compliance/runs/:id/reviews", requireRole(["app_aci"]), zValidator("json", ReviewBodySchema), async (c) => {
		const id = c.req.param("id")
		const { decision, notes } = c.req.valid("json")
		const user = c.get("user")

		const { data: run, error } = await supabase.from("compliance_run").select("id, status").eq("id", id).maybeSingle()
		if (error) return c.json({ error: "Internal Server Error", code: "RUN_LOOKUP_FAILED" }, 500)
		if (!run) return c.json({ error: "Not Found", code: "RUN_NOT_FOUND" }, 404)
		if (run.status !== "succeeded") {
			return c.json(
				{ error: "Conflict", code: "RUN_NOT_SUCCEEDED", message: `a execução está "${run.status}" — parecer só sobre execução concluída`, status: run.status },
				409
			)
		}

		const { data: findings } = await supabase.from("compliance_finding").select("severity, triage").eq("run_id", id)
		const triaged = (findings ?? []) as TriagedFinding[]

		const blockers = decisionBlockers(triaged, decision)
		if (blockers.length > 0) {
			// `message` legível: o portal exibe `message ?? code`, e o analista precisa
			// saber O QUE falta triar, não só que algo bloqueou.
			return c.json({ error: "Conflict", code: "DECISION_BLOCKED", message: blockers.join("; "), blockers }, 409)
		}

		const { data: review, error: insertError } = await supabase
			.from("compliance_review")
			.insert({ run_id: id, reviewer_id: user.id, decision, notes: notes?.trim() || null, snapshot: reviewSnapshot(triaged) })
			.select("id, run_id, decision, notes, snapshot, reviewer_id, created_at")
			.single()

		if (insertError || !review) return c.json({ error: "Internal Server Error", code: "REVIEW_PERSIST_FAILED" }, 500)

		return c.json(review, 201)
	})

	// GET /api/v1/compliance/runs/:id/report — relatório final (JSON ou Markdown)
	.get("/api/v1/compliance/runs/:id/report", zValidator("query", ReportQuerySchema), async (c) => {
		const id = c.req.param("id")
		const { format } = c.req.valid("query")

		if (!(await canReadComplianceRun(id, c.get("user"), c.get("role")))) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)

		const { data: run, error } = await supabase.from("compliance_run").select(RUN_COLUMNS).eq("id", id).maybeSingle()
		if (error) return c.json({ error: "Internal Server Error", code: "RUN_LOOKUP_FAILED" }, 500)
		if (!run) return c.json({ error: "Not Found", code: "RUN_NOT_FOUND" }, 404)

		const [{ data: submission }, { data: extraction }, { data: findings }, { data: reviews }, modelDocuments, lawDocuments] = await Promise.all([
			supabase.from("submission").select("id, filename, doc_kind, modalidade, objeto, created_at").eq("id", run.submission_id).maybeSingle(),
			supabase.from("extraction").select("id, model, created_at").eq("id", run.extraction_id).maybeSingle(),
			supabase.from("compliance_finding").select(FINDING_COLUMNS).eq("run_id", id),
			supabase.from("compliance_review").select("id, decision, notes, reviewer_id, created_at").eq("run_id", id).order("created_at", { ascending: false }),
			loadDocuments(run.model_document_id ? [run.model_document_id] : []),
			loadDocuments(run.law_document_ids ?? []),
		])

		if (!submission) return c.json({ error: "Not Found", code: "SUBMISSION_NOT_FOUND" }, 404)

		const report: FinalReport = {
			run,
			submission,
			extraction: extraction ?? null,
			model_document: modelDocuments[0] ?? null,
			law_documents: lawDocuments,
			findings: (findings ?? []) as ReportFinding[],
			reviews: (reviews ?? []) as ReportReview[],
		}

		if (format === "md") {
			return c.text(renderReportMarkdown(report), 200, {
				"Content-Type": "text/markdown; charset=utf-8",
				"Content-Disposition": `attachment; filename="relatorio-conformidade-${id}.md"`,
			})
		}

		return c.json({
			...report,
			_links: { self: { href: `/api/v1/compliance/runs/${id}/report` }, markdown: { href: `/api/v1/compliance/runs/${id}/report?format=md` } },
		})
	})
