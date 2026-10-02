import { describe, expect, it } from "bun:test"
import { decideComplianceRun, isStaleRun, runInsertConflict, STALE_RUN_MS } from "./run-policy.ts"

const NOW = new Date("2026-10-01T12:00:00Z")
const run = (status: string, minutesAgo = 1) => ({
	id: `${status}-${minutesAgo}`,
	status,
	started_at: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
})
const base = { runs: [], hasReview: false, canReview: false, maxRuns: 3, now: NOW }

describe("decideComplianceRun", () => {
	it("primeira verificação: qualquer leitor do processo", () => {
		expect(decideComplianceRun(base)).toEqual({ allowed: true })
	})

	it("falha não conta: o autor tenta de novo depois de uma execução que falhou", () => {
		expect(decideComplianceRun({ ...base, runs: [run("failed")] })).toEqual({ allowed: true })
	})

	it("depois de concluída, só o ACI repete", () => {
		const runs = [run("succeeded")]
		expect(decideComplianceRun({ ...base, runs })).toMatchObject({ allowed: false, code: "COMPLIANCE_RERUN_ACI_ONLY" })
		expect(decideComplianceRun({ ...base, runs, canReview: true })).toEqual({ allowed: true })
	})

	it("teto por submissão vale também para o ACI", () => {
		const runs = [run("succeeded", 3), run("succeeded", 2), run("succeeded", 1)]
		expect(decideComplianceRun({ ...base, runs, canReview: true })).toMatchObject({ allowed: false, code: "COMPLIANCE_RUN_LIMIT" })
	})

	it("parecer congela, antes de qualquer outra regra", () => {
		expect(decideComplianceRun({ ...base, runs: [run("running")], hasReview: true, canReview: true })).toMatchObject({
			allowed: false,
			code: "COMPLIANCE_FROZEN",
		})
	})

	it("uma execução em andamento por vez; a presa além do prazo não segura", () => {
		expect(decideComplianceRun({ ...base, runs: [run("running", 1)] })).toMatchObject({ allowed: false, code: "COMPLIANCE_RUN_IN_PROGRESS" })
		const stuckMinutes = STALE_RUN_MS / 60_000 + 1
		expect(isStaleRun(run("running", stuckMinutes), NOW)).toBe(true)
		expect(decideComplianceRun({ ...base, runs: [run("running", stuckMinutes)] })).toEqual({ allowed: true })
	})
})

describe("runInsertConflict", () => {
	it("traduz as travas do banco e deixa o resto passar", () => {
		expect(runInsertConflict({ code: "23505", message: "duplicate key value violates unique constraint" })?.code).toBe("COMPLIANCE_RUN_IN_PROGRESS")
		expect(runInsertConflict({ code: "23514", message: "COMPLIANCE_FROZEN" })?.code).toBe("COMPLIANCE_FROZEN")
		expect(runInsertConflict({ code: "23514", message: "outra checagem" })).toBeNull()
		expect(runInsertConflict(null)).toBeNull()
	})
})
