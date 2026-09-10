import { describe, expect, it } from "bun:test"
import { decisionBlockers, reviewSnapshot, type TriagedFinding } from "./review.ts"

const f = (severity: TriagedFinding["severity"], triage: TriagedFinding["triage"]): TriagedFinding => ({ severity, triage })

describe("decisionBlockers", () => {
	it("reprovar é sempre possível", () => {
		expect(decisionBlockers([f("BLOQUEANTE", null), f("GRAVE", null)], "reprovado")).toEqual([])
	})

	it("aprovar exige que todo crítico tenha sido triado", () => {
		// Aprovar com bloqueante sem triagem seria assinar sem ler.
		const blockers = decisionBlockers([f("BLOQUEANTE", null), f("INFORMATIVA", null)], "aprovado")
		expect(blockers).toHaveLength(1)
		expect(blockers[0]).toContain("sem triagem")
	})

	it("MEDIA/INFORMATIVA sem triagem não travam a aprovação", () => {
		expect(decisionBlockers([f("MEDIA", null), f("INFORMATIVA", null)], "aprovado")).toEqual([])
	})

	it("bloqueante acatado só cabe em reprovação", () => {
		expect(decisionBlockers([f("BLOQUEANTE", "acatado")], "aprovado")).toHaveLength(1)
		expect(decisionBlockers([f("BLOQUEANTE", "acatado")], "aprovado_com_ressalvas")).toHaveLength(1)
		expect(decisionBlockers([f("BLOQUEANTE", "acatado")], "reprovado")).toEqual([])
	})

	it("grave acatado desce a aprovação para com ressalvas", () => {
		expect(decisionBlockers([f("GRAVE", "acatado")], "aprovado")).toHaveLength(1)
		expect(decisionBlockers([f("GRAVE", "acatado")], "aprovado_com_ressalvas")).toEqual([])
	})

	it("crítico descartado libera a aprovação sem ressalvas", () => {
		expect(decisionBlockers([f("BLOQUEANTE", "descartado"), f("GRAVE", "descartado")], "aprovado")).toEqual([])
	})

	it("sem achado nenhum, aprova", () => {
		expect(decisionBlockers([], "aprovado")).toEqual([])
	})
})

describe("reviewSnapshot", () => {
	it("retrata acatados por severidade e o que ficou sem triagem", () => {
		const snapshot = reviewSnapshot([f("BLOQUEANTE", "descartado"), f("GRAVE", "acatado"), f("GRAVE", "acatado"), f("MEDIA", null)])
		expect(snapshot).toEqual({
			total: 4,
			acatados: 2,
			descartados: 1,
			sem_triagem: 1,
			acatados_por_severidade: { BLOQUEANTE: 0, GRAVE: 2, MEDIA: 0, INFORMATIVA: 0 },
		})
	})
})
