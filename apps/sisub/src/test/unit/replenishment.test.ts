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
	test("mediana do observado com ≥2 amostras, arredondada pra cima — vence o prazo da cozinha", () => {
		expect(estimateLeadTime([5, 11, 7], null, 3)).toEqual({ days: 7, source: "observed" })
		expect(estimateLeadTime([4, 7], null, null)).toEqual({ days: 6, source: "observed" })
	})

	test("sem histórico suficiente → prazo da ARP, indicando a origem", () => {
		expect(estimateLeadTime([9], 15, 7)).toEqual({ days: 15, source: "arp_default" })
	})

	test("sem histórico nem ARP → prazo de entrega padrão da cozinha", () => {
		expect(estimateLeadTime([9], null, 5)).toEqual({ days: 5, source: "kitchen_default" })
	})

	test("sem nenhum dos três → pendência, nunca um número presumido", () => {
		expect(estimateLeadTime([], null, null)).toEqual({ days: null, source: "not_configured" })
		expect(estimateLeadTime([9], null, null)).toEqual({ days: null, source: "not_configured" })
		// valor inválido (0, negativo) não é configuração
		expect(estimateLeadTime([], null, 0)).toEqual({ days: null, source: "not_configured" })
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

	test("3) Supermercado Virtual: CATMAT + cobertura abaixo do limiar + valor dentro do somatório", () => {
		expect(decideChannel({ ...base, coverageDays: 3, smallValue: true }).channel).toBe("supermercado_virtual")
	})

	test("3-neg) urgência sozinha não é dispensa: fora do somatório vai para licitação", () => {
		const decision = decideChannel({ ...base, coverageDays: 3 })
		expect(decision.channel).toBe("licitacao")
		expect(decision.reason).toContain("urgência sozinha não autoriza dispensa")
	})

	test("3-neg) urgente sem CATMAT e dentro do somatório vai para o Contrata+Brasil", () => {
		expect(decideChannel({ ...base, coverageDays: 3, hasCatmat: false, smallValue: true }).channel).toBe("contrata_mais")
	})

	test("memória de cálculo mostra quanto resta do limite", () => {
		expect(decideChannel({ ...base, smallValue: true, dispensaRemaining: 1000 }).reason).toContain("resta")
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

	test("urgência indeterminada: o canal que depende dela fica indeterminado", () => {
		const decision = decideChannel({ ...base, urgencyThresholdDays: null, coverageDays: 1, smallValue: true })
		expect(decision).toMatchObject({ channel: null, urgency: "undetermined" })
		expect(decision.reason).toContain("prazo de entrega não configurado")
	})

	test("urgência indeterminada não atrapalha o canal que não depende dela", () => {
		const undetermined = { ...base, urgencyThresholdDays: null }
		expect(decideChannel({ ...undetermined, ownArpBalance: 200 })).toMatchObject({ channel: "own_arp", urgency: "undetermined" })
		expect(decideChannel({ ...undetermined, smallValue: true, hasCatmat: false })).toMatchObject({ channel: "contrata_mais", urgency: "undetermined" })
		const fallback = decideChannel(undetermined)
		expect(fallback).toMatchObject({ channel: "licitacao", urgency: "undetermined" })
		expect(fallback.reason).toContain("urgência indeterminada")
	})

	test("urgência determinada pelo limiar", () => {
		expect(decideChannel({ ...base, coverageDays: 3 }).urgency).toBe("urgent")
		expect(decideChannel(base).urgency).toBe("not_urgent")
	})

	test("toda decisão carrega a memória de cálculo (reason)", () => {
		for (const scenario of [base, { ...base, ownArpBalance: 200 }, { ...base, coverageDays: 1 }, { ...base, smallValue: true }]) {
			expect(decideChannel(scenario).reason.length).toBeGreaterThan(10)
		}
	})
})
