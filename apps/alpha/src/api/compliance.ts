/**
 * Rotas de conformidade e da bancada de calibração de regras.
 *
 * A bancada existe porque regra semeada de nota da AGU nasce em `draft`: alguém
 * precisa ver o veredito, os trechos recuperados e o que o guard de citação
 * faria, antes de promover a regra para `active`.
 */

import { zValidator } from "@hono/zod-validator"
import type { User } from "@supabase/supabase-js"
import { Hono } from "hono"
import { z } from "zod"
import { LegalRefResolver } from "../compliance/resolve-legal-ref.ts"
import { runCompliance } from "../compliance/run.ts"
import { ComplianceRunConflictError, decideComplianceRun, isStaleRun, type RunRecord } from "../compliance/run-policy.ts"
import { applyCitationGuard, type ChecklistRule, judgeRule } from "../compliance/verify.ts"
import { supabase } from "../db/supabase.ts"
import { env } from "../env.ts"
import type { AlphaAccess } from "../lib/alpha-access.ts"
import { DocumentLimitError } from "../lib/document-limits.ts"
import { enforceUsage } from "../lib/usage-limit.ts"
import { requireRole } from "../middleware/require-role.ts"
import { canReadComplianceRun, canReadSubmission, canReviewSubmission, extractionBelongsToSubmission } from "./authorize.ts"
import { FINDING_COLUMNS, RUN_COLUMNS } from "./columns.ts"

type Variables = { user: User; access: AlphaAccess }

const RunBodySchema = z.object({
	submission_id: z.uuid(),
	extraction_id: z.uuid(),
})

const EvaluateBodySchema = z.object({
	// Teto de tamanho: o trecho vai inteiro para o modelo.
	text: z.string().min(20).max(20_000),
	label: z.string().max(200).optional(),
})

const RuleStatusSchema = z.object({
	status: z.enum(["draft", "active", "needs_review", "retired"]),
})

/** Execuções da submissão e se alguma tem parecer. `null` = a leitura falhou (a rota recusa). */
async function loadRunHistory(submissionId: string): Promise<{ runs: RunRecord[]; hasReview: boolean } | null> {
	const { data: runs, error } = await supabase.from("compliance_run").select("id, status, started_at").eq("submission_id", submissionId)
	if (error) {
		console.error(`[compliance] execuções da submissão ${JSON.stringify(submissionId)} não lidas: ${error.message}`)
		return null
	}
	const runIds = (runs ?? []).map((run) => run.id as string)
	if (runIds.length === 0) return { runs: [], hasReview: false }

	const { data: reviews, error: reviewsError } = await supabase.from("compliance_review").select("id").in("run_id", runIds).limit(1)
	if (reviewsError) {
		console.error(`[compliance] pareceres da submissão ${JSON.stringify(submissionId)} não lidos: ${reviewsError.message}`)
		return null
	}
	return { runs: (runs ?? []) as RunRecord[], hasReview: (reviews ?? []).length > 0 }
}

export const complianceRoutes = new Hono<{ Variables: Variables }>()
	// POST /api/v1/compliance/runs — executa a verificação
	.post("/api/v1/compliance/runs", zValidator("json", RunBodySchema), async (c) => {
		const { submission_id, extraction_id } = c.req.valid("json")
		const user = c.get("user")
		const access = c.get("access")

		if (!(await canReadSubmission(submission_id, user, access))) {
			return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
		}
		// Extração de outra submissão produziria um parecer com trechos de um
		// documento que não é o analisado — e possivelmente de outro usuário.
		if (!(await extractionBelongsToSubmission(extraction_id, submission_id))) {
			return c.json({ error: "Bad Request", code: "EXTRACTION_SUBMISSION_MISMATCH" }, 400)
		}

		// Reexecução: congelada depois do parecer, uma por vez, e só o ACI repete uma
		// verificação concluída — ver `compliance/run-policy.ts`. Antes do teto diário, para a
		// recusa não gastar cota.
		const history = await loadRunHistory(submission_id)
		if (history === null) return c.json({ error: "Internal Server Error", code: "RUNS_FAILED" }, 500)
		const now = new Date()
		const policy = decideComplianceRun({
			...history,
			canReview: await canReviewSubmission(submission_id, access),
			maxRuns: env.ALPHA_COMPLIANCE_MAX_RUNS_PER_SUBMISSION,
			now,
		})
		if (!policy.allowed) return c.json({ error: "Conflict", code: policy.code, message: policy.message }, 409)

		// Execução que ficou `running` além do prazo (o processo caiu no meio) seguraria a
		// submissão para sempre pelo índice único: é dada como falha antes da nova.
		const stale = history.runs.filter((run) => isStaleRun(run, now)).map((run) => run.id)
		if (stale.length > 0) {
			const { error: reapError } = await supabase
				.from("compliance_run")
				.update({ status: "failed", finished_at: now.toISOString() })
				.in("id", stale)
				.eq("status", "running")
			if (reapError) console.error(`[compliance] execuções presas ${stale.join(", ")} não encerradas: ${reapError.message}`)
		}

		const refused = await enforceUsage(c, user.id, "compliance")
		if (refused) return refused

		try {
			return c.json(await runCompliance(submission_id, extraction_id), 201)
		} catch (error) {
			if (error instanceof ComplianceRunConflictError) {
				return c.json({ error: "Conflict", code: error.code, message: error.message }, 409)
			}
			if (error instanceof DocumentLimitError) {
				return c.json({ error: "Unprocessable Entity", code: "DOCUMENT_TOO_LARGE", message: error.message }, 422)
			}
			// Erro de provider traz ARN de role, região e id de modelo — fica no log, não na resposta.
			console.error(`[compliance] execução da submissão ${submission_id} falhou:`, error)
			return c.json({ error: "Bad Gateway", code: "COMPLIANCE_RUN_FAILED", message: "falha na verificação de conformidade" }, 502)
		}
	})

	// GET /api/v1/compliance/runs/:id — relatório consolidado
	.get("/api/v1/compliance/runs/:id", async (c) => {
		const id = c.req.param("id")

		if (!(await canReadComplianceRun(id, c.get("user"), c.get("access")))) {
			return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
		}

		const { data: run, error } = await supabase.from("compliance_run").select(RUN_COLUMNS).eq("id", id).maybeSingle()

		if (error) return c.json({ error: "Internal Server Error", code: "RUN_LOOKUP_FAILED" }, 500)
		if (!run) return c.json({ error: "Not Found", code: "RUN_NOT_FOUND" }, 404)

		// `error` conferido: "zero achados" e "a consulta falhou" não podem ser a
		// mesma resposta — foi assim que a triagem entrou nas colunas e um deploy
		// antes da migration devolveria toda execução como limpa, com 200.
		const { data: findings, error: findingsError } = await supabase.from("compliance_finding").select(FINDING_COLUMNS).eq("run_id", id)
		if (findingsError) return c.json({ error: "Internal Server Error", code: "FINDINGS_FAILED" }, 500)

		return c.json({ run, findings: findings ?? [], _links: { self: { href: `/api/v1/compliance/runs/${id}` } } })
	})

	// GET /api/v1/rules — regras, com filtro por status
	.get("/api/v1/rules", zValidator("query", z.object({ status: z.enum(["draft", "active", "needs_review", "retired"]).optional() })), async (c) => {
		const { status } = c.req.valid("query")

		let query = supabase
			.from("checklist_rule")
			.select("id, code, kind, severity, status, origin, legal_ref, applicability, target_field, statement, updated_at")
			.order("updated_at", { ascending: false })
			.limit(200)

		if (status) query = query.eq("status", status)

		const { data, error } = await query
		if (error) return c.json({ error: "Internal Server Error", code: "RULES_FAILED" }, 500)

		return c.json({ rules: data ?? [], _links: { self: { href: "/api/v1/rules" } } })
	})

	// POST /api/v1/rules/:id/evaluate — testa uma regra isolada contra um trecho
	// Avaliar regra dispara chamada de modelo com texto arbitrário do usuário:
	// mesmo perfil que promove regra, para não virar um proxy de LLM aberto.
	// ACI GLOBAL: a regra é catálogo compartilhado por todas as OMs.
	.post("/api/v1/rules/:id/evaluate", requireRole("aci", { global: true }), zValidator("json", EvaluateBodySchema), async (c) => {
		const id = c.req.param("id")
		const { text, label } = c.req.valid("json")

		const { data: rule, error } = await supabase
			.from("checklist_rule")
			.select("id, code, kind, severity, legal_ref, applicability, target_field, statement, prompt")
			.eq("id", id)
			.maybeSingle()

		if (error) return c.json({ error: "Internal Server Error", code: "RULE_LOOKUP_FAILED" }, 500)
		if (!rule) return c.json({ error: "Not Found", code: "RULE_NOT_FOUND" }, 404)

		const refused = await enforceUsage(c, c.get("user").id, "rule_evaluation")
		if (refused) return refused

		try {
			const verdict = await judgeRule(rule as ChecklistRule, { label: label ?? "trecho avulso", text })
			// `text` vai junto: sem ele a prévia usada para promover regra aplicaria um gate
			// mais FROUXO que a execução real, e a regra entraria em produção aprovada por um
			// critério que ninguém vai repetir.
			const guard = await applyCitationGuard(verdict, new LegalRefResolver(), text)

			return c.json({ rule_id: id, verdict, guard })
		} catch (evaluationError) {
			console.error(`[compliance] avaliação da regra ${rule.id} falhou:`, evaluationError)
			return c.json({ error: "Bad Gateway", code: "RULE_EVALUATION_FAILED", message: "falha na avaliação da regra" }, 502)
		}
	})

	// PATCH /api/v1/rules/:id — promoção e despromoção, sempre explícitas
	// ACI GLOBAL: promover uma regra muda o parecer de TODAS as OMs — o ACI de uma OM não
	// decide isso sozinho.
	.patch("/api/v1/rules/:id", requireRole("aci", { global: true }), zValidator("json", RuleStatusSchema), async (c) => {
		const id = c.req.param("id")
		const { status } = c.req.valid("json")

		const { data, error } = await supabase.from("checklist_rule").update({ status }).eq("id", id).select("id, code, status").maybeSingle()

		if (error) return c.json({ error: "Internal Server Error", code: "RULE_UPDATE_FAILED" }, 500)
		if (!data) return c.json({ error: "Not Found", code: "RULE_NOT_FOUND" }, 404)

		return c.json(data)
	})
