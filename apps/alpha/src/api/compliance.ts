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
import { applyCitationGuard, type ChecklistRule, judgeRule } from "../compliance/verify.ts"
import { supabase } from "../db/supabase.ts"
import type { AppRole } from "../middleware/auth.ts"
import { requireRole } from "../middleware/auth.ts"
import { canReadComplianceRun, canReadSubmission, extractionBelongsToSubmission } from "./authorize.ts"

type Variables = { user: User; role: AppRole }

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

export const complianceRoutes = new Hono<{ Variables: Variables }>()
	// POST /api/v1/compliance/runs — executa a verificação
	.post("/api/v1/compliance/runs", zValidator("json", RunBodySchema), async (c) => {
		const { submission_id, extraction_id } = c.req.valid("json")

		if (!(await canReadSubmission(submission_id, c.get("user"), c.get("role")))) {
			return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
		}
		// Extração de outra submissão produziria um parecer com trechos de um
		// documento que não é o analisado — e possivelmente de outro usuário.
		if (!(await extractionBelongsToSubmission(extraction_id, submission_id))) {
			return c.json({ error: "Bad Request", code: "EXTRACTION_SUBMISSION_MISMATCH" }, 400)
		}

		try {
			return c.json(await runCompliance(submission_id, extraction_id), 201)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			return c.json({ error: "Bad Gateway", code: "COMPLIANCE_RUN_FAILED", message }, 502)
		}
	})

	// GET /api/v1/compliance/runs/:id — relatório consolidado
	.get("/api/v1/compliance/runs/:id", async (c) => {
		const id = c.req.param("id")

		if (!(await canReadComplianceRun(id, c.get("user"), c.get("role")))) {
			return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
		}

		const { data: run, error } = await supabase
			.from("compliance_run")
			.select(
				"id, submission_id, extraction_id, model_document_id, law_document_ids, status, rules_applied, rules_not_assessed, discarded_findings, started_at, finished_at"
			)
			.eq("id", id)
			.maybeSingle()

		if (error) return c.json({ error: "Internal Server Error", code: "RUN_LOOKUP_FAILED" }, 500)
		if (!run) return c.json({ error: "Not Found", code: "RUN_NOT_FOUND" }, 404)

		const { data: findings } = await supabase
			.from("compliance_finding")
			.select("id, rule_id, category, status, severity, section_path, message, legal_ref, suggestion, evidence_span, confidence")
			.eq("run_id", id)

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
	.post("/api/v1/rules/:id/evaluate", requireRole(["app_aci"]), zValidator("json", EvaluateBodySchema), async (c) => {
		const id = c.req.param("id")
		const { text, label } = c.req.valid("json")

		const { data: rule, error } = await supabase
			.from("checklist_rule")
			.select("id, code, kind, severity, legal_ref, applicability, target_field, statement, prompt")
			.eq("id", id)
			.maybeSingle()

		if (error) return c.json({ error: "Internal Server Error", code: "RULE_LOOKUP_FAILED" }, 500)
		if (!rule) return c.json({ error: "Not Found", code: "RULE_NOT_FOUND" }, 404)

		try {
			const verdict = await judgeRule(rule as ChecklistRule, { label: label ?? "trecho avulso", text })
			const guard = await applyCitationGuard(verdict, new LegalRefResolver())

			return c.json({ rule_id: id, verdict, guard })
		} catch (evaluationError) {
			const message = evaluationError instanceof Error ? evaluationError.message : String(evaluationError)
			return c.json({ error: "Bad Gateway", code: "RULE_EVALUATION_FAILED", message }, 502)
		}
	})

	// PATCH /api/v1/rules/:id — promoção e despromoção, sempre explícitas
	.patch("/api/v1/rules/:id", requireRole(["app_aci"]), zValidator("json", RuleStatusSchema), async (c) => {
		const id = c.req.param("id")
		const { status } = c.req.valid("json")

		const { data, error } = await supabase.from("checklist_rule").update({ status }).eq("id", id).select("id, code, status").maybeSingle()

		if (error) return c.json({ error: "Internal Server Error", code: "RULE_UPDATE_FAILED" }, 500)
		if (!data) return c.json({ error: "Not Found", code: "RULE_NOT_FOUND" }, 404)

		return c.json(data)
	})
