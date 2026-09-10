import { describe, expect, it } from "bun:test"
import { blockersByDecision, decisionBlockers, reviewSnapshot, type TriagedFinding } from "./review.ts"

let seq = 0
const f = (severity: TriagedFinding["severity"], triage: TriagedFinding["triage"], triage_note: string | null = null): TriagedFinding => ({
	id: `f${++seq}`,
	severity,
	triage,
	triage_note,
})

const blockers = (findings: TriagedFinding[], decision: Parameters<typeof decisionBlockers>[1]) => decisionBlockers(reviewSnapshot(findings), decision)

describe("decisionBlockers", () => {
	it("reprovar é sempre possível", () => {
		expect(blockers([f("BLOQUEANTE", null), f("GRAVE", null)], "reprovado")).toEqual([])
	})

	it("aprovar exige que todo crítico tenha sido triado", () => {
		// Aprovar com bloqueante sem triagem seria assinar sem ler.
		const result = blockers([f("BLOQUEANTE", null), f("INFORMATIVA", null)], "aprovado")
		expect(result).toHaveLength(1)
		expect(result[0]).toContain("sem triagem")
	})

	it("MEDIA/INFORMATIVA sem triagem não travam a aprovação", () => {
		expect(blockers([f("MEDIA", null), f("INFORMATIVA", null)], "aprovado")).toEqual([])
	})

	it("bloqueante acatado só cabe em reprovação", () => {
		expect(blockers([f("BLOQUEANTE", "acatado")], "aprovado")).toHaveLength(1)
		expect(blockers([f("BLOQUEANTE", "acatado")], "aprovado_com_ressalvas")).toHaveLength(1)
		expect(blockers([f("BLOQUEANTE", "acatado")], "reprovado")).toEqual([])
	})

	it("grave acatado desce a aprovação para com ressalvas", () => {
		expect(blockers([f("GRAVE", "acatado")], "aprovado")).toHaveLength(1)
		expect(blockers([f("GRAVE", "acatado")], "aprovado_com_ressalvas")).toEqual([])
	})

	it("crítico descartado libera a aprovação sem ressalvas", () => {
		expect(blockers([f("BLOQUEANTE", "descartado", "revogado"), f("GRAVE", "descartado", "já consta")], "aprovado")).toEqual([])
	})

	it("sem achado nenhum, aprova", () => {
		expect(blockers([], "aprovado")).toEqual([])
	})

	it("blockersByDecision cobre as três decisões de uma vez", () => {
		const result = blockersByDecision(reviewSnapshot([f("GRAVE", "acatado")]))
		expect(result.aprovado).toHaveLength(1)
		expect(result.aprovado_com_ressalvas).toEqual([])
		expect(result.reprovado).toEqual([])
	})
})

describe("reviewSnapshot", () => {
	it("retrata contagens E a triagem de cada achado", () => {
		const findings = [f("BLOQUEANTE", "descartado", "dispositivo revogado"), f("GRAVE", "acatado"), f("GRAVE", "acatado"), f("MEDIA", null)]
		const snapshot = reviewSnapshot(findings)

		expect(snapshot.total).toBe(4)
		expect(snapshot.accepted).toBe(2)
		expect(snapshot.discarded).toBe(1)
		expect(snapshot.untriaged).toBe(1)
		expect(snapshot.accepted_by_severity).toEqual({ BLOQUEANTE: 0, GRAVE: 2, MEDIA: 0, INFORMATIVA: 0 })
		expect(snapshot.untriaged_by_severity).toEqual({ BLOQUEANTE: 0, GRAVE: 0, MEDIA: 1, INFORMATIVA: 0 })
		// A lista é o que o relatório usa quando alguém re-tria depois do parecer.
		expect(snapshot.findings).toEqual(findings.map(({ id, severity, triage, triage_note }) => ({ id, severity, triage, triage_note })))
	})
})
