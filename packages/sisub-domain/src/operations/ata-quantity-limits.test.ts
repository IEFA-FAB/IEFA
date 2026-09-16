import { describe, expect, test } from "bun:test"
import {
	computeAtaItemLimits,
	computeMaxQuantity,
	computeQuantityLimits,
	countDeliveries,
	DEFAULT_MAX_MARGIN_PERCENT,
	requiresMarginJustification,
	resolveDeliveryCycle,
	resolveMarginPercent,
} from "./ata-quantity-limits.ts"

const monthly = { cycle: "monthly" as const, source: "ata" as const }
const weekly = { cycle: "weekly" as const, source: "ata" as const }

describe("computeMaxQuantity", () => {
	test("aplica a margem sobre o alvo e arredonda para cima", () => {
		expect(computeMaxQuantity(1000, 20)).toBe(1200)
		expect(computeMaxQuantity(1234.5, 10)).toBe(1358)
	})

	test("ruído de ponto flutuante não sobe uma unidade", () => {
		// 100 × 1.1 = 110.00000000000001 em IEEE 754.
		expect(computeMaxQuantity(100, 10)).toBe(110)
	})

	test("alvo fracionário abaixo de 1 registra 1, e alvo zero registra 0", () => {
		expect(computeMaxQuantity(0.4, 0)).toBe(1)
		expect(computeMaxQuantity(0, 50)).toBe(0)
	})
})

describe("resolveMarginPercent", () => {
	test("margem zero do item é escolha, não ausência", () => {
		expect(resolveMarginPercent(0, 30)).toBe(0)
	})

	test("sem margem no item vale a da ata, e sem as duas vale o padrão de 20%", () => {
		expect(resolveMarginPercent(null, 30)).toBe(30)
		expect(resolveMarginPercent(undefined, null)).toBe(DEFAULT_MAX_MARGIN_PERCENT)
		expect(DEFAULT_MAX_MARGIN_PERCENT).toBe(20)
	})
})

describe("resolveDeliveryCycle", () => {
	test("o gravado na ata vence o padrão do insumo", () => {
		// Mudar o insumo depois não pode mudar o ciclo de uma ata já montada.
		expect(resolveDeliveryCycle({ ataCycle: "monthly", ingredientCycle: "weekly" })).toEqual({ cycle: "monthly", source: "ata" })
	})

	test("sem ciclo na ata, vale o padrão do insumo", () => {
		expect(resolveDeliveryCycle({ ingredientCycle: "weekly", conservationClass: "seco" })).toEqual({ cycle: "weekly", source: "ingredient" })
	})

	test("insumo sem classificação: resfriado é semanal, o resto mensal", () => {
		expect(resolveDeliveryCycle({ conservationClass: "resfriado" })).toEqual({ cycle: "weekly", source: "conservation" })
		expect(resolveDeliveryCycle({ conservationClass: "congelado" })).toEqual({ cycle: "monthly", source: "fallback" })
		expect(resolveDeliveryCycle({})).toEqual({ cycle: "monthly", source: "fallback" })
	})

	test("valor fora do vocabulário é ignorado, não quebra", () => {
		expect(resolveDeliveryCycle({ ataCycle: "quinzenal", ingredientCycle: "diario" })).toEqual({ cycle: "monthly", source: "fallback" })
	})
})

describe("countDeliveries", () => {
	test("12 meses são 52 semanas ou 12 meses", () => {
		expect(countDeliveries("weekly", 12)).toBe(52)
		expect(countDeliveries("monthly", 12)).toBe(12)
	})

	test("nunca zero entregas", () => {
		expect(countDeliveries("weekly", 0)).toBe(4)
		expect(countDeliveries("monthly", 0)).toBe(1)
	})
})

describe("computeQuantityLimits", () => {
	test("sugere metade do consumo de um ciclo como mínimo por pedido", () => {
		// 12 meses mensais → 12 entregas; 1200 kg/ano → 100 kg por entrega → mínimo 50.
		const limits = computeQuantityLimits({ targetQuantity: 1200, validityMonths: 12, marginPercent: 20, deliveryCycle: monthly })
		expect(limits.maxQuantity).toBe(1440)
		expect(limits.effectiveMarginPercent).toBe(20)
		expect(limits.deliveriesInValidity).toBe(12)
		expect(limits.cycleConsumption).toBe(100)
		expect(limits.suggestedMinOrderQuantity).toBe(50)
		expect(limits.minOrderQuantity).toBe(50)
		expect(limits.minOrderSource).toBe("suggested")
		expect(limits.warnings).toEqual([])
	})

	test("perecível semanal tem mínimo menor que o mesmo alvo mensal", () => {
		const limits = computeQuantityLimits({ targetQuantity: 1200, validityMonths: 12, marginPercent: 20, deliveryCycle: weekly })
		expect(limits.deliveriesInValidity).toBe(52)
		expect(limits.suggestedMinOrderQuantity).toBe(11)
	})

	test("consumo de ciclo abaixo de 2 ainda sugere 1, sem aviso de mínimo", () => {
		const limits = computeQuantityLimits({ targetQuantity: 10, validityMonths: 12, marginPercent: 20, deliveryCycle: weekly })
		expect(limits.suggestedMinOrderQuantity).toBe(1)
		expect(limits.warnings).toEqual([])
	})

	describe("folga colada", () => {
		test("margem abaixo de 10% avisa", () => {
			const limits = computeQuantityLimits({ targetQuantity: 1000, validityMonths: 12, marginPercent: 5, deliveryCycle: monthly })
			expect(limits.warnings).toEqual(["margin_tight"])
		})

		test("exatamente 10% não avisa", () => {
			const limits = computeQuantityLimits({ targetQuantity: 1000, validityMonths: 12, marginPercent: 10, deliveryCycle: monthly })
			expect(limits.warnings).toEqual([])
		})

		test("mede a folga EFETIVA: o arredondamento de alvo pequeno já dá folga", () => {
			// 3 kg com 5% → 3,15 → registra 4: folga de 33%.
			const limits = computeQuantityLimits({ targetQuantity: 3, validityMonths: 12, marginPercent: 5, deliveryCycle: monthly })
			expect(limits.maxQuantity).toBe(4)
			expect(limits.warnings).not.toContain("margin_tight")
		})

		test("margem zero avisa", () => {
			const limits = computeQuantityLimits({ targetQuantity: 500, validityMonths: 12, marginPercent: 0, deliveryCycle: monthly })
			expect(limits.warnings).toContain("margin_tight")
		})
	})

	describe("margem alta", () => {
		test("acima de 50% entra na justificativa, e 50% exato não", () => {
			const base = { targetQuantity: 1200, validityMonths: 12, deliveryCycle: monthly }
			expect(computeQuantityLimits({ ...base, marginPercent: 50 }).warnings).toEqual([])
			expect(computeQuantityLimits({ ...base, marginPercent: 51 }).warnings).toEqual(["margin_requires_justification"])
		})

		test("25% não pede nada", () => {
			const limits = computeQuantityLimits({ targetQuantity: 1200, validityMonths: 12, marginPercent: 25, deliveryCycle: monthly })
			expect(limits.warnings).toEqual([])
		})
	})

	test("mínimo informado no item prevalece e é avaliado", () => {
		const limits = computeQuantityLimits({ targetQuantity: 1200, validityMonths: 12, marginPercent: 20, deliveryCycle: monthly, minOrderOverride: 300 })
		expect(limits.minOrderQuantity).toBe(300)
		expect(limits.minOrderSource).toBe("item")
		// 300 > 100 consumidos por ciclo; 1440 ÷ 300 = 4 pedidos < 12 entregas.
		expect(limits.warnings).toEqual(["min_exceeds_cycle_consumption", "min_exhausts_before_validity"])
	})

	test("mínimo acima da máxima é o único aviso de mínimo", () => {
		const limits = computeQuantityLimits({ targetQuantity: 100, validityMonths: 12, marginPercent: 20, deliveryCycle: monthly, minOrderOverride: 150 })
		expect(limits.warnings).toEqual(["min_exceeds_max"])
	})

	test("mínimo igual ao consumo do ciclo arredondado não avisa", () => {
		const limits = computeQuantityLimits({ targetQuantity: 1210, validityMonths: 12, marginPercent: 20, deliveryCycle: monthly, minOrderOverride: 101 })
		expect(limits.warnings).toEqual([])
	})

	test("alvo zero não registra, não sugere e não avisa", () => {
		const limits = computeQuantityLimits({ targetQuantity: 0, validityMonths: 12, marginPercent: 0, deliveryCycle: monthly, minOrderOverride: 5 })
		expect(limits.maxQuantity).toBe(0)
		expect(limits.effectiveMarginPercent).toBeNull()
		expect(limits.suggestedMinOrderQuantity).toBe(0)
		expect(limits.warnings).toEqual([])
	})
})

describe("computeAtaItemLimits", () => {
	const list = { validityMonths: 12, maxMarginPercent: 25 }

	test("usa a quantidade de compra quando há vínculo, senão a da cozinha", () => {
		expect(computeAtaItemLimits({ purchaseQuantity: 100, totalQuantity: 5000 }, list).maxQuantity).toBe(125)
		expect(computeAtaItemLimits({ purchaseQuantity: null, totalQuantity: 80 }, list).maxQuantity).toBe(100)
	})

	test("insumo perecível entra no ciclo semanal", () => {
		const limits = computeAtaItemLimits({ purchaseQuantity: 520, totalQuantity: 0, ingredientDeliveryCycle: "weekly" }, list)
		expect(limits.deliveryCycle).toBe("weekly")
		expect(limits.deliveryCycleSource).toBe("ingredient")
		expect(limits.suggestedMinOrderQuantity).toBe(5)
	})

	test("ata sem vigência declarada usa 12 meses", () => {
		const limits = computeAtaItemLimits({ purchaseQuantity: 1200, totalQuantity: 0 }, { maxMarginPercent: 20 })
		expect(limits.deliveriesInValidity).toBe(12)
	})
})

describe("requiresMarginJustification", () => {
	test("basta um item acima da referência", () => {
		const ok = computeAtaItemLimits({ purchaseQuantity: 100, totalQuantity: 0 }, { maxMarginPercent: 20 })
		const high = computeAtaItemLimits({ purchaseQuantity: 100, totalQuantity: 0, maxMarginPercent: 60 }, { maxMarginPercent: 20 })
		expect(requiresMarginJustification([ok])).toBe(false)
		expect(requiresMarginJustification([ok, high])).toBe(true)
	})
})
