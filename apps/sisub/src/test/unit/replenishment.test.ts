/**
 * Unit — MRP (Fase 7): FC/IR, necessidade líquida, lead time com fallback e
 * tabela de decisão de canal (ordem determinística do spec).
 */
import { applyCorrectionFactors, calculateNetNeed, decideChannel, estimateLeadTime } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"

describe("applyCorrectionFactors", () => {
	test("FC multiplica (compra-se peso bruto): 100 líquidos × 1.2 = 120", () => {
		expect(applyCorrectionFactors(100, { correctionFactor: 1.2, rehydrationIndex: null })).toBe(120)
	})

	test("IR divide (necessidade hidratada → seco): 100 ÷ 2.5 = 40", () => {
		expect(applyCorrectionFactors(100, { correctionFactor: null, rehydrationIndex: 2.5 })).toBe(40)
	})

	test("FC e IR compõem: 100 × 1.2 ÷ 2 = 60", () => {
		expect(applyCorrectionFactors(100, { correctionFactor: 1.2, rehydrationIndex: 2 })).toBe(60)
	})

	test("fatores nulos/inválidos caem para 1 (herança: receita → ingrediente → 1)", () => {
		expect(applyCorrectionFactors(100, { correctionFactor: null, rehydrationIndex: null })).toBe(100)
		expect(applyCorrectionFactors(100, { correctionFactor: 0, rehydrationIndex: -1 })).toBe(100)
	})
})

describe("calculateNetNeed", () => {
	test("bruta 100 − estoque 30 − trânsito 20 = 50 (cenário do spec)", () => {
		expect(calculateNetNeed({ grossDemand: 100, availableStock: 30, inTransit: 20 })).toBe(50)
	})

	test("nunca negativa", () => {
		expect(calculateNetNeed({ grossDemand: 10, availableStock: 100, inTransit: 0 })).toBe(0)
	})
})

describe("estimateLeadTime", () => {
	test("mediana do observado com ≥2 amostras, arredondada pra cima", () => {
		expect(estimateLeadTime([5, 11, 7], null, 7)).toEqual({ days: 7, source: "observed" })
		expect(estimateLeadTime([4, 7], null, 7)).toEqual({ days: 6, source: "observed" })
	})

	test("sem histórico suficiente → prazo da ARP, indicando a origem", () => {
		expect(estimateLeadTime([9], 15, 7)).toEqual({ days: 15, source: "arp_default" })
	})

	test("sem ARP → default da política (mínimo 1)", () => {
		expect(estimateLeadTime([], null, 7)).toEqual({ days: 7, source: "policy_default" })
		expect(estimateLeadTime([], null, 0)).toEqual({ days: 1, source: "policy_default" })
	})
})

describe("decideChannel — ordem determinística", () => {
	const base = { netNeed: 50, ownArpBalance: 0, caronaAvailable: null, hasCatmat: true, coverageDays: 10, urgencyThresholdDays: 7, smallValue: false }

	test("1) ARP própria com saldo suficiente", () => {
		expect(decideChannel({ ...base, ownArpBalance: 200 }).channel).toBe("own_arp")
	})

	test("2) carona quando há ARP externa localizável", () => {
		expect(decideChannel({ ...base, caronaAvailable: true }).channel).toBe("carona")
	})

	test("3) Supermercado Virtual: CATMAT + cobertura abaixo do limiar", () => {
		expect(decideChannel({ ...base, coverageDays: 3 }).channel).toBe("supermercado_virtual")
	})

	test("3-neg) urgente sem CATMAT não vai pro Supermercado Virtual", () => {
		expect(decideChannel({ ...base, coverageDays: 3, hasCatmat: false }).channel).toBe("licitacao")
	})

	test("4) pequeno valor → Contrata+Brasil", () => {
		expect(decideChannel({ ...base, smallValue: true }).channel).toBe("contrata_mais")
	})

	test("5) fallback → licitação", () => {
		expect(decideChannel(base).channel).toBe("licitacao")
	})

	test("ARP própria tem precedência sobre todos", () => {
		expect(decideChannel({ ...base, ownArpBalance: 200, caronaAvailable: true, coverageDays: 1, smallValue: true }).channel).toBe("own_arp")
	})

	test("toda decisão carrega a memória de cálculo (reason)", () => {
		for (const scenario of [base, { ...base, ownArpBalance: 200 }, { ...base, coverageDays: 1 }, { ...base, smallValue: true }]) {
			expect(decideChannel(scenario).reason.length).toBeGreaterThan(10)
		}
	})
})
