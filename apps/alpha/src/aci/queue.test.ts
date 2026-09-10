import { describe, expect, it } from "bun:test"
import { buildQueue, deriveStage, type QueueExtraction, type QueueReview, type QueueRun, type QueueSubmission, summarizeQueue } from "./queue.ts"

const submission = (id: string, created_at = "2026-09-01T10:00:00Z"): QueueSubmission => ({
	id,
	user_id: "u1",
	filename: `${id}.docx`,
	doc_kind: "TR",
	modalidade: null,
	objeto: "SERVICOS",
	created_at,
})

const extraction = (id: string, submission_id: string, created_at: string): QueueExtraction => ({ id, submission_id, created_at })

const run = (id: string, submission_id: string, status: string, started_at: string): QueueRun => ({
	id,
	submission_id,
	status,
	rules_applied: 6,
	rules_not_assessed: 1,
	discarded_findings: 2,
	started_at,
	finished_at: started_at,
})

const review = (run_id: string, decision: QueueReview["decision"], created_at: string): QueueReview => ({ run_id, decision, created_at })

describe("deriveStage", () => {
	it("começa em enviado", () => {
		expect(deriveStage(null, null, null)).toBe("enviado")
	})

	it("execução que falhou não conta como verificado", () => {
		// O analista veria um processo pronto para parecer sem nenhum achado para ler.
		const failed = run("r1", "s1", "failed", "2026-09-01T11:00:00Z")
		expect(deriveStage(extraction("e1", "s1", "2026-09-01T10:30:00Z"), failed, null)).toBe("extraido")
	})

	it("execução em andamento também fica em extraído", () => {
		const running = run("r1", "s1", "running", "2026-09-01T11:00:00Z")
		expect(deriveStage(extraction("e1", "s1", "2026-09-01T10:30:00Z"), running, null)).toBe("extraido")
	})

	it("parecer só sobre a execução vigente", () => {
		const ok = run("r1", "s1", "succeeded", "2026-09-01T11:00:00Z")
		expect(deriveStage(extraction("e1", "s1", "2026-09-01T10:30:00Z"), ok, null)).toBe("verificado")
		expect(deriveStage(extraction("e1", "s1", "2026-09-01T10:30:00Z"), ok, review("r1", "aprovado", "2026-09-01T12:00:00Z"))).toBe("parecer")
	})
})

describe("buildQueue", () => {
	it("usa a execução MAIS RECENTE, não a primeira encontrada", () => {
		// Parecer emitido sobre a execução antiga é histórico: reexecutar volta o
		// processo para "verificado".
		const items = buildQueue({
			submissions: [submission("s1")],
			extractions: [extraction("e1", "s1", "2026-09-01T10:30:00Z")],
			runs: [run("r-old", "s1", "succeeded", "2026-09-01T11:00:00Z"), run("r-new", "s1", "succeeded", "2026-09-02T11:00:00Z")],
			findings: [{ run_id: "r-old", severity: "BLOQUEANTE", triage: "acatado" }],
			reviews: [review("r-old", "reprovado", "2026-09-01T12:00:00Z")],
		})

		expect(items[0]?.latest_run?.id).toBe("r-new")
		expect(items[0]?.stage).toBe("verificado")
		expect(items[0]?.latest_review).toBeNull()
		// Achado da execução antiga não vaza para a contagem da nova.
		expect(items[0]?.severity_counts.BLOQUEANTE).toBe(0)
	})

	it("conta crítico aberto = BLOQUEANTE/GRAVE acatado ou sem triagem; descartado sai", () => {
		const items = buildQueue({
			submissions: [submission("s1")],
			extractions: [extraction("e1", "s1", "2026-09-01T10:30:00Z")],
			runs: [run("r1", "s1", "succeeded", "2026-09-01T11:00:00Z")],
			findings: [
				{ run_id: "r1", severity: "BLOQUEANTE", triage: null },
				{ run_id: "r1", severity: "GRAVE", triage: "acatado" },
				{ run_id: "r1", severity: "GRAVE", triage: "descartado" },
				{ run_id: "r1", severity: "MEDIA", triage: null },
				{ run_id: "r1", severity: "INFORMATIVA", triage: null },
			],
			reviews: [],
		})

		expect(items[0]?.open_critical).toBe(2)
		expect(items[0]?.untriaged).toBe(3)
		expect(items[0]?.severity_counts).toEqual({ BLOQUEANTE: 1, GRAVE: 2, MEDIA: 1, INFORMATIVA: 1 })
	})

	it("preserva a ordem das submissões recebidas", () => {
		const items = buildQueue({
			submissions: [submission("s2", "2026-09-02T00:00:00Z"), submission("s1", "2026-09-01T00:00:00Z")],
			extractions: [],
			runs: [],
			findings: [],
			reviews: [],
		})
		expect(items.map((item) => item.submission.id)).toEqual(["s2", "s1"])
	})
})

describe("summarizeQueue", () => {
	it("crítico aberto só conta antes do parecer", () => {
		const items = buildQueue({
			submissions: [submission("s1"), submission("s2")],
			extractions: [extraction("e1", "s1", "2026-09-01T10:30:00Z"), extraction("e2", "s2", "2026-09-01T10:30:00Z")],
			runs: [run("r1", "s1", "succeeded", "2026-09-01T11:00:00Z"), run("r2", "s2", "succeeded", "2026-09-01T11:00:00Z")],
			findings: [
				{ run_id: "r1", severity: "BLOQUEANTE", triage: "acatado" },
				{ run_id: "r2", severity: "BLOQUEANTE", triage: "acatado" },
			],
			reviews: [review("r2", "reprovado", "2026-09-01T12:00:00Z")],
		})

		const totals = summarizeQueue(items)
		expect(totals.processos).toBe(2)
		expect(totals.por_etapa).toEqual({ enviado: 0, extraido: 0, verificado: 1, parecer: 1 })
		expect(totals.aguardando_parecer).toBe(1)
		expect(totals.criticos_abertos).toBe(1)
		expect(totals.pareceres).toEqual({ aprovado: 0, aprovado_com_ressalvas: 0, reprovado: 1 })
	})
})
