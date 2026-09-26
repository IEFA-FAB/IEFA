/**
 * Conformidade da pesquisa de preços com a IN SEGES/ME 65/2021. Nenhuma regra trava: cada uma
 * vira não conformidade registrada, e a justificativa correspondente a resolve.
 */

import { describe, expect, test } from "bun:test"
import { complianceFactsOf, type SavePriceResearchAudit } from "./price-research.ts"
import { evaluateResearchCompliance, justificationsToPersist, type ResearchComplianceFacts, researchNonComplianceReasons } from "./price-research-compliance.ts"

/** Pesquisa conforme: 5 preços de 4 UASGs, mediana, janela de 12 meses. */
function facts(overrides: Partial<ResearchComplianceFacts> = {}): ResearchComplianceFacts {
	return {
		validCount: 5,
		referencePrice: 10,
		stats: { median: 10, uniqueSources: 4 },
		measureUnit: "KG",
		unitInferred: false,
		method: "median",
		periodMonths: 12,
		undatedCount: 0,
		manualSelection: false,
		...overrides,
	}
}

const codes = (f: ResearchComplianceFacts) => evaluateResearchCompliance(f).map((x) => x.code)
const JUSTIFIED = "Item de mercado restrito: só 2 órgãos compraram no último ano."

describe("evaluateResearchCompliance", () => {
	test("pesquisa conforme não tem não conformidade", () => {
		expect(evaluateResearchCompliance(facts())).toEqual([])
		expect(researchNonComplianceReasons(facts())).toEqual([])
	})

	test("menos de 3 preços cita o art. 6º, § 5º, e pede justificativa", () => {
		const [finding] = evaluateResearchCompliance(facts({ validCount: 2, stats: { median: 10, uniqueSources: 3 } }))
		expect(finding.code).toBe("low_sample")
		expect(finding.basis).toContain("art. 6º, caput e § 5º")
		expect(finding.justification).toBe("lowSample")
		expect(finding.justified).toBe(false)
	})

	test("3 UASGs é critério da unidade, não da IN", () => {
		const [finding] = evaluateResearchCompliance(facts({ stats: { median: 10, uniqueSources: 2 } }))
		expect(finding.code).toBe("few_sources")
		expect(finding.basis).toContain("Critério da unidade")
		expect(finding.basis).not.toMatch(/art\./)
	})

	test("a justificativa da amostra reduzida resolve poucos preços e poucas fontes", () => {
		const f = facts({ validCount: 2, stats: { median: 10, uniqueSources: 1 }, justifications: { lowSample: JUSTIFIED } })
		expect(evaluateResearchCompliance(f).every((x) => x.justified)).toBe(true)
		expect(researchNonComplianceReasons(f)).toEqual([])
	})

	test("justificativa curta demais não conta", () => {
		const f = facts({ validCount: 2, justifications: { lowSample: "  ok  " } })
		expect(researchNonComplianceReasons(f)).toHaveLength(1)
	})

	test("todo o histórico e janela maior que 12 meses citam o art. 5º", () => {
		const whole = evaluateResearchCompliance(facts({ periodMonths: null }))
		expect(whole.map((x) => x.code)).toEqual(["out_of_period"])
		expect(whole[0].message).toContain("todo o histórico")
		expect(whole[0].basis).toContain("art. 5º, I e II, e § 3º")
		expect(codes(facts({ periodMonths: 24 }))).toEqual(["out_of_period"])
		expect(codes(facts({ periodMonths: 12 }))).toEqual([])
		expect(codes(facts({ periodMonths: 6 }))).toEqual([])
	})

	test("amostra sem data no cálculo é não conformidade; a justificativa do período a resolve", () => {
		const f = facts({ undatedCount: 2 })
		const [finding] = evaluateResearchCompliance(f)
		expect(finding.code).toBe("undated_samples")
		expect(finding.message).toBe("2 amostras sem data de referência no cálculo")
		expect(researchNonComplianceReasons({ ...f, justifications: { outOfPeriod: "Compra de 2025 sem data no Compras.gov.br, conferida no PNCP." } })).toEqual([])
	})

	test("seleção manual pede o critério de desconsideração (art. 6º, § 3º)", () => {
		const [finding] = evaluateResearchCompliance(facts({ manualSelection: true }))
		expect(finding.code).toBe("manual_exclusion")
		expect(finding.basis).toContain("art. 6º, § 3º")
		expect(finding.justification).toBe("outlierCriteria")
	})

	test("menor preço é método do caput; método fora dele pede justificativa (art. 6º, § 1º)", () => {
		expect(codes(facts({ method: "lowest", referencePrice: 8 }))).toEqual([])
		const [finding] = evaluateResearchCompliance(facts({ method: "weighted" }))
		expect(finding.code).toBe("other_method")
		expect(finding.basis).toContain("art. 6º, § 1º")
	})

	test("preço acima da mediana não se justifica", () => {
		const f = facts({ method: "mean", referencePrice: 11, justifications: { lowSample: JUSTIFIED, method: JUSTIFIED } })
		const [finding] = evaluateResearchCompliance(f)
		expect(finding.code).toBe("above_median")
		expect(finding.justification).toBeNull()
		expect(finding.justified).toBe(false)
	})

	test("o texto gravado traz a base", () => {
		expect(researchNonComplianceReasons(facts({ validCount: 1, stats: { median: 10, uniqueSources: 3 } }))).toEqual([
			"Menos de 3 preços válidos (1) (IN SEGES/ME 65/2021, art. 6º, caput e § 5º)",
		])
	})
})

describe("justificationsToPersist", () => {
	test("grava só a justificativa que responde a uma não conformidade, aparada", () => {
		const f = facts({
			validCount: 2,
			justifications: { lowSample: `  ${JUSTIFIED}  `, outOfPeriod: "Não há período fora do prazo nesta pesquisa." },
		})
		expect(justificationsToPersist(f)).toEqual({ lowSample: JUSTIFIED, method: null, outlierCriteria: null, outOfPeriod: null })
	})
})

describe("complianceFactsOf", () => {
	test("conta como sem data a amostra válida sem dataResultado nem dataCompra", () => {
		const sample = (id: number, date: string | null) => ({ idCompra: "c", idItemCompra: id, dataResultado: date })
		const input: SavePriceResearchAudit = {
			catmatCodigo: 1,
			method: "median",
			referencePrice: 10,
			stats: { mean: 10, median: 10, stdDev: 0, cv: 0, min: 10, max: 10, uniqueSources: 3 },
			rawCount: 3,
			periodMonths: 12,
			validCount: 3,
			validSamples: [sample(1, "2026-06-01"), sample(2, null), { idCompra: "c", idItemCompra: 3, dataCompra: "2026-05-01" }],
			outlierSamples: [sample(4, null)],
		}
		expect(complianceFactsOf(input).undatedCount).toBe(1)
		expect(researchNonComplianceReasons(complianceFactsOf(input))).toEqual([
			"1 amostra sem data de referência no cálculo (IN SEGES/ME 65/2021, art. 5º, II, e § 3º: sem data, não há como mostrar que o preço é de até 1 ano)",
		])
	})
})
