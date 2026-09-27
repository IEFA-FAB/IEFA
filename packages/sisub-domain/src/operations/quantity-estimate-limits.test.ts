import { describe, expect, test } from "bun:test"
import {
	computeMaxQuantity,
	computeMinQuoteQuantity,
	computeQuantityEstimateItemLimits,
	computeQuantityLimits,
	countDeliveries,
	DEFAULT_MAX_INCREASE_PERCENT,
	requiresMaxQuantityJustification,
	resolveDeliveryCycle,
	resolveIncreasePercent,
} from "./quantity-estimate-limits.ts"

const monthly = { cycle: "monthly" as const, source: "item" as const }
const weekly = { cycle: "weekly" as const, source: "item" as const }

describe("computeMaxQuantity", () => {
	test("aplica o acréscimo sobre a estimada e arredonda para cima", () => {
		expect(computeMaxQuantity(1000, 20)).toBe(1200)
		expect(computeMaxQuantity(1234.5, 10)).toBe(1358)
	})

	test("ruído de ponto flutuante não sobe uma unidade", () => {
		// 100 × 1.1 = 110.00000000000001 em IEEE 754.
		expect(computeMaxQuantity(100, 10)).toBe(110)
	})

	test("estimada fracionária abaixo de 1 registra 1, e estimada zero registra 0", () => {
		expect(computeMaxQuantity(0.4, 0)).toBe(1)
		expect(computeMaxQuantity(0, 50)).toBe(0)
	})
})

describe("resolveIncreasePercent", () => {
	test("acréscimo zero do item é escolha, não ausência", () => {
		expect(resolveIncreasePercent(0, 30)).toBe(0)
	})

	test("sem acréscimo no item vale o do anexo, e sem as duas vale o padrão de 20%", () => {
		expect(resolveIncreasePercent(null, 30)).toBe(30)
		expect(resolveIncreasePercent(undefined, null)).toBe(DEFAULT_MAX_INCREASE_PERCENT)
		expect(DEFAULT_MAX_INCREASE_PERCENT).toBe(20)
	})
})

describe("resolveDeliveryCycle", () => {
	test("o gravado no item do anexo vence o padrão do insumo", () => {
		// Mudar o insumo depois não pode mudar o ciclo de um anexo já montado.
		expect(resolveDeliveryCycle({ itemCycle: "monthly", ingredientCycle: "weekly" })).toEqual({ cycle: "monthly", source: "item" })
	})

	test("sem ciclo no item do anexo, vale o padrão do insumo", () => {
		expect(resolveDeliveryCycle({ ingredientCycle: "weekly", conservationClass: "seco" })).toEqual({ cycle: "weekly", source: "ingredient" })
	})

	test("insumo sem classificação: resfriado é semanal, o resto mensal", () => {
		expect(resolveDeliveryCycle({ conservationClass: "resfriado" })).toEqual({ cycle: "weekly", source: "conservation" })
		expect(resolveDeliveryCycle({ conservationClass: "congelado" })).toEqual({ cycle: "monthly", source: "fallback" })
		expect(resolveDeliveryCycle({})).toEqual({ cycle: "monthly", source: "fallback" })
	})

	test("valor fora do vocabulário é ignorado, não quebra", () => {
		expect(resolveDeliveryCycle({ itemCycle: "quinzenal", ingredientCycle: "diario" })).toEqual({ cycle: "monthly", source: "fallback" })
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
		const limits = computeQuantityLimits({ estimatedQuantity: 1200, validityMonths: 12, increasePercent: 20, deliveryCycle: monthly })
		expect(limits.maxQuantity).toBe(1440)
		expect(limits.effectiveIncreasePercent).toBe(20)
		expect(limits.deliveriesInValidity).toBe(12)
		expect(limits.cycleConsumption).toBe(100)
		expect(limits.suggestedMinOrderQuantity).toBe(50)
		expect(limits.minOrderQuantity).toBe(50)
		expect(limits.minOrderSource).toBe("suggested")
		expect(limits.warnings).toEqual([])
	})

	test("perecível semanal tem mínimo menor que a mesma estimada mensal", () => {
		const limits = computeQuantityLimits({ estimatedQuantity: 1200, validityMonths: 12, increasePercent: 20, deliveryCycle: weekly })
		expect(limits.deliveriesInValidity).toBe(52)
		expect(limits.suggestedMinOrderQuantity).toBe(11)
	})

	test("consumo de ciclo abaixo de 2 ainda sugere 1, sem aviso de mínimo", () => {
		const limits = computeQuantityLimits({ estimatedQuantity: 10, validityMonths: 12, increasePercent: 20, deliveryCycle: weekly })
		expect(limits.suggestedMinOrderQuantity).toBe(1)
		expect(limits.warnings).toEqual([])
	})

	describe("folga colada", () => {
		test("acréscimo abaixo de 10% avisa", () => {
			const limits = computeQuantityLimits({ estimatedQuantity: 1000, validityMonths: 12, increasePercent: 5, deliveryCycle: monthly })
			expect(limits.warnings).toEqual(["increase_tight"])
		})

		test("exatamente 10% não avisa", () => {
			const limits = computeQuantityLimits({ estimatedQuantity: 1000, validityMonths: 12, increasePercent: 10, deliveryCycle: monthly })
			expect(limits.warnings).toEqual([])
		})

		test("mede o acréscimo EFETIVO: o arredondamento de estimada pequena já dá acréscimo", () => {
			// 3 kg com 5% → 3,15 → registra 4: folga de 33%.
			const limits = computeQuantityLimits({ estimatedQuantity: 3, validityMonths: 12, increasePercent: 5, deliveryCycle: monthly })
			expect(limits.maxQuantity).toBe(4)
			expect(limits.warnings).not.toContain("increase_tight")
		})

		test("acréscimo zero avisa", () => {
			const limits = computeQuantityLimits({ estimatedQuantity: 500, validityMonths: 12, increasePercent: 0, deliveryCycle: monthly })
			expect(limits.warnings).toContain("increase_tight")
		})
	})

	describe("acréscimo alto", () => {
		test("acima de 50% entra na justificativa, e 50% exato não", () => {
			const base = { estimatedQuantity: 1200, validityMonths: 12, deliveryCycle: monthly }
			expect(computeQuantityLimits({ ...base, increasePercent: 50 }).warnings).toEqual([])
			expect(computeQuantityLimits({ ...base, increasePercent: 51 }).warnings).toEqual(["increase_requires_justification"])
		})

		test("25% não pede nada", () => {
			const limits = computeQuantityLimits({ estimatedQuantity: 1200, validityMonths: 12, increasePercent: 25, deliveryCycle: monthly })
			expect(limits.warnings).toEqual([])
		})
	})

	test("mínimo informado no item prevalece e é avaliado", () => {
		const limits = computeQuantityLimits({ estimatedQuantity: 1200, validityMonths: 12, increasePercent: 20, deliveryCycle: monthly, minOrderOverride: 300 })
		expect(limits.minOrderQuantity).toBe(300)
		expect(limits.minOrderSource).toBe("item")
		// 300 > 100 consumidos por ciclo; 1440 ÷ 300 = 4 pedidos < 12 entregas.
		expect(limits.warnings).toEqual(["min_exceeds_cycle_consumption", "min_exhausts_before_validity"])
	})

	test("mínimo acima da máxima é o único aviso de mínimo", () => {
		const limits = computeQuantityLimits({ estimatedQuantity: 100, validityMonths: 12, increasePercent: 20, deliveryCycle: monthly, minOrderOverride: 150 })
		expect(limits.warnings).toEqual(["min_exceeds_max"])
	})

	test("mínimo igual ao consumo do ciclo arredondado não avisa", () => {
		const limits = computeQuantityLimits({ estimatedQuantity: 1210, validityMonths: 12, increasePercent: 20, deliveryCycle: monthly, minOrderOverride: 101 })
		expect(limits.warnings).toEqual([])
	})

	test("estimada zero não registra, não sugere e não avisa", () => {
		const limits = computeQuantityLimits({ estimatedQuantity: 0, validityMonths: 12, increasePercent: 0, deliveryCycle: monthly, minOrderOverride: 5 })
		expect(limits.maxQuantity).toBe(0)
		expect(limits.effectiveIncreasePercent).toBeNull()
		expect(limits.suggestedMinOrderQuantity).toBe(0)
		expect(limits.warnings).toEqual([])
	})
})

describe("computeQuantityEstimateItemLimits", () => {
	const list = { validityMonths: 12, maxIncreasePercent: 25 }

	test("usa a quantidade de compra quando há vínculo, senão a da cozinha", () => {
		expect(computeQuantityEstimateItemLimits({ purchaseQuantity: 100, estimatedQuantity: 5000 }, list).maxQuantity).toBe(125)
		expect(computeQuantityEstimateItemLimits({ purchaseQuantity: null, estimatedQuantity: 80 }, list).maxQuantity).toBe(100)
	})

	test("insumo perecível entra no ciclo semanal", () => {
		const limits = computeQuantityEstimateItemLimits({ purchaseQuantity: 520, estimatedQuantity: 0, ingredientDeliveryCycle: "weekly" }, list)
		expect(limits.deliveryCycle).toBe("weekly")
		expect(limits.deliveryCycleSource).toBe("ingredient")
		expect(limits.suggestedMinOrderQuantity).toBe(5)
	})

	test("anexo sem vigência declarada usa 12 meses", () => {
		const limits = computeQuantityEstimateItemLimits({ purchaseQuantity: 1200, estimatedQuantity: 0 }, { maxIncreasePercent: 20 })
		expect(limits.deliveriesInValidity).toBe(12)
	})
})

describe("requiresMaxQuantityJustification", () => {
	test("basta um item acima da referência", () => {
		const ok = computeQuantityEstimateItemLimits({ purchaseQuantity: 100, estimatedQuantity: 0 }, { maxIncreasePercent: 20 })
		const high = computeQuantityEstimateItemLimits({ purchaseQuantity: 100, estimatedQuantity: 0, maxIncreasePercent: 60 }, { maxIncreasePercent: 20 })
		expect(requiresMaxQuantityJustification([ok])).toBe(false)
		expect(requiresMaxQuantityJustification([ok, high])).toBe(true)
	})
})

describe("computeMinQuoteQuantity", () => {
	test("percentual da máxima, arredondado para cima sem erro de ponto flutuante", () => {
		expect(computeMinQuoteQuantity(1000, 25)).toBe(250)
		expect(computeMinQuoteQuantity(100, 7)).toBe(7)
		expect(computeMinQuoteQuantity(10, 33)).toBe(4)
	})

	test("padrão é a máxima inteira; sem máxima não há mínima", () => {
		expect(computeMinQuoteQuantity(40, null)).toBe(40)
		expect(computeMinQuoteQuantity(null, 25)).toBeNull()
		expect(computeMinQuoteQuantity(0, 25)).toBe(0)
	})
})
