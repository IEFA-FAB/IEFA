import { describe, expect, it } from "bun:test"
import { buildQueue, deriveStage, type QueueRow, summarizeQueue, toQueueItem } from "./queue.ts"

const row = (overrides: Partial<QueueRow> = {}): QueueRow => ({
	submission_id: "s1",
	user_id: "u1",
	filename: "s1.docx",
	doc_kind: "TR",
	modalidade: null,
	objeto: "SERVICOS",
	submitted_at: "2026-09-01T10:00:00Z",
	extraction_id: null,
	extraction_created_at: null,
	run_id: null,
	run_status: null,
	run_started_at: null,
	run_finished_at: null,
	rules_applied: null,
	rules_not_assessed: null,
	discarded_findings: null,
	review_decision: null,
	review_created_at: null,
	finding_counts: [],
	...overrides,
})

const extracted = { extraction_id: "e1", extraction_created_at: "2026-09-01T10:30:00Z" }
const ran = (status: QueueRow["run_status"]) => ({
	...extracted,
	run_id: "r1",
	run_status: status,
	run_started_at: "2026-09-01T11:00:00Z",
	run_finished_at: "2026-09-01T11:03:00Z",
	rules_applied: 6,
	rules_not_assessed: 1,
	discarded_findings: 2,
})

describe("deriveStage", () => {
	it("começa em enviado", () => {
		expect(deriveStage(false, null, false)).toBe("enviado")
	})

	it("execução que falhou ou está rodando não conta como verificado", () => {
		// O analista veria um processo pronto para parecer sem nenhum achado para ler.
		expect(deriveStage(true, "failed", false)).toBe("extraido")
		expect(deriveStage(true, "running", false)).toBe("extraido")
	})

	it("parecer só sobre a execução vigente", () => {
		expect(deriveStage(true, "succeeded", false)).toBe("verificado")
		expect(deriveStage(true, "succeeded", true)).toBe("parecer")
	})
})

describe("toQueueItem", () => {
	it("soma as contagens por severidade e separa crítico aberto de descartado", () => {
		const item = toQueueItem(
			row({
				...ran("succeeded"),
				finding_counts: [
					{ severity: "BLOQUEANTE", triage: null, count: 1 },
					{ severity: "GRAVE", triage: "acatado", count: 2 },
					{ severity: "GRAVE", triage: "descartado", count: 1 },
					{ severity: "MEDIA", triage: null, count: 3 },
					{ severity: "INFORMATIVA", triage: null, count: 4 },
				],
			})
		)

		expect(item.stage).toBe("verificado")
		expect(item.severity_counts).toEqual({ BLOQUEANTE: 1, GRAVE: 3, MEDIA: 3, INFORMATIVA: 4 })
		expect(item.open_critical).toBe(3)
		expect(item.untriaged).toBe(8)
		expect(item.latest_run?.rules_applied).toBe(6)
	})

	it("linha sem execução vira processo sem execução, não execução vazia", () => {
		const item = toQueueItem(row(extracted))
		expect(item.stage).toBe("extraido")
		expect(item.latest_run).toBeNull()
		expect(item.latest_review).toBeNull()
		expect(item.severity_counts).toEqual({ BLOQUEANTE: 0, GRAVE: 0, MEDIA: 0, INFORMATIVA: 0 })
	})

	it("parecer na linha leva o processo para a etapa final", () => {
		const item = toQueueItem(row({ ...ran("succeeded"), review_decision: "reprovado", review_created_at: "2026-09-01T12:00:00Z" }))
		expect(item.stage).toBe("parecer")
		expect(item.latest_review).toEqual({ decision: "reprovado", created_at: "2026-09-01T12:00:00Z" })
	})
})

describe("buildQueue / summarizeQueue", () => {
	it("preserva a ordem das linhas e totaliza por etapa", () => {
		const items = buildQueue([
			row({ submission_id: "s2", ...ran("succeeded"), finding_counts: [{ severity: "BLOQUEANTE", triage: "acatado", count: 1 }] }),
			row({
				submission_id: "s3",
				...ran("succeeded"),
				review_decision: "reprovado",
				review_created_at: "2026-09-01T12:00:00Z",
				finding_counts: [{ severity: "BLOQUEANTE", triage: "acatado", count: 1 }],
			}),
			row({ submission_id: "s1" }),
		])

		expect(items.map((item) => item.submission.id)).toEqual(["s2", "s3", "s1"])

		const totals = summarizeQueue(items)
		expect(totals.processes).toBe(3)
		expect(totals.by_stage).toEqual({ enviado: 1, extraido: 0, verificado: 1, parecer: 1 })
		expect(totals.awaiting_review).toBe(1)
		// Crítico aberto só conta antes do parecer: depois, a decisão já o absorveu.
		expect(totals.open_critical).toBe(1)
		expect(totals.reviews).toEqual({ aprovado: 0, aprovado_com_ressalvas: 0, reprovado: 1 })
	})
})
