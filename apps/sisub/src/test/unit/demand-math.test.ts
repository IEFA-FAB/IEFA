/**
 * Unit — matemática compartilhada demanda→quantidade (scaleIngredientQuantity).
 * Puro (sem DB): garante que os dois motores de procurement usam a MESMA fórmula.
 */

import { resolveItemDemand, scaleIngredientQuantity } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"

describe("scaleIngredientQuantity", () => {
	test("quantidade = net × (demanda / rendimento) × repetições", () => {
		// 100g líquidos, receita rende 200 porções, 400 comensais → 2× a receita = 200g.
		expect(scaleIngredientQuantity(100, 400, 200)).toBe(200)
	})

	test("repetições multiplicam (horizonte da ATA)", () => {
		expect(scaleIngredientQuantity(100, 400, 200, 3)).toBe(600)
	})

	test("rendimento 0/nulo cai para 1 (não divide por zero)", () => {
		expect(scaleIngredientQuantity(50, 10, 0)).toBe(500)
	})

	test("paridade aquisição (×repetições=N) vs datado (×1)", () => {
		// Mesma demanda, N ocorrências: projeção da ATA (repetitions=N) == somar N datas (×1).
		const ata = scaleIngredientQuantity(100, 400, 200, 4)
		const daily = Array.from({ length: 4 }, () => scaleIngredientQuantity(100, 400, 200)).reduce((a, b) => a + b, 0)
		// toBeCloseTo (não toBe): a fórmula é float; a ordem das multiplicações pode divergir
		// no último bit para entradas fracionárias reais.
		expect(ata).toBeCloseTo(daily, 10)
	})
})

describe("resolveItemDemand", () => {
	test("quantidade direta do item vence tudo", () => {
		expect(resolveItemDemand({ headcountOverride: 120, baseHeadcount: 800, recommendedProportion: 30 })).toBe(120)
	})

	test("porcentagem aplica sobre o efetivo da refeição", () => {
		expect(resolveItemDemand({ baseHeadcount: 800, recommendedProportion: 30 })).toBe(240)
	})

	test("sem porcentagem, o item herda o efetivo cheio da refeição", () => {
		expect(resolveItemDemand({ baseHeadcount: 800 })).toBe(800)
	})

	test("sem efetivo e sem quantidade direta, não há demanda dimensionável", () => {
		expect(resolveItemDemand({ recommendedProportion: 30 })).toBeNull()
		expect(resolveItemDemand({})).toBeNull()
	})

	test("arredonda para pessoa inteira", () => {
		expect(resolveItemDemand({ baseHeadcount: 785, recommendedProportion: 33 })).toBe(259)
	})

	test("0% é zero comensais, não 'campo vazio'", () => {
		expect(resolveItemDemand({ baseHeadcount: 800, recommendedProportion: 0 })).toBe(0)
	})
})
