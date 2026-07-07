import { describe, expect, test } from "vitest"
import type { IngredientSnapshot } from "@/types/domain/ingredient-versions"
import { computeIngredientDiff, summarizeDiff } from "./ingredient-diff"

function snapshot(overrides: Partial<IngredientSnapshot> = {}): IngredientSnapshot {
	return {
		ingredient: {
			description: "Arroz",
			folder_id: "f1",
			folder_description: "Grãos",
			measure_unit: "kg",
			correction_factor: 1,
			ceafa_id: null,
			ceafa_description: null,
		},
		nutrients: [],
		product_items: [],
		purchase_links: [],
		...overrides,
	}
}

describe("computeIngredientDiff", () => {
	test("sem versão anterior devolve baseline vazia (isEmpty)", () => {
		const diff = computeIngredientDiff(null, snapshot())
		expect(diff.isEmpty).toBe(true)
		expect(diff.fields).toEqual([])
		expect(diff.nutrients).toEqual([])
	})

	test("snapshots idênticos → isEmpty", () => {
		const s = snapshot()
		const diff = computeIngredientDiff(s, snapshot())
		expect(diff.isEmpty).toBe(true)
	})

	test("detecta mudança de campo de identificação", () => {
		const prev = snapshot()
		const curr = snapshot({ ingredient: { ...prev.ingredient, description: "Arroz Integral" } })
		const diff = computeIngredientDiff(prev, curr)
		expect(diff.isEmpty).toBe(false)
		expect(diff.fields).toEqual([{ key: "description", label: "Nome", from: "Arroz", to: "Arroz Integral" }])
	})

	test("correction_factor compara numericamente (1 == 1.0, string vs number)", () => {
		const prev = snapshot({ ingredient: { ...snapshot().ingredient, correction_factor: 1 } })
		// simula vinda do banco como string "1.0"
		const curr = snapshot({ ingredient: { ...snapshot().ingredient, correction_factor: "1.0" as unknown as number } })
		const diff = computeIngredientDiff(prev, curr)
		expect(diff.fields).toEqual([])
	})

	test("nutriente adicionado, alterado e removido", () => {
		const prev = snapshot({
			nutrients: [
				{ nutrient_id: "kcal", name: "Energia", value: 100 },
				{ nutrient_id: "prot", name: "Proteína", value: 5 },
			],
		})
		const curr = snapshot({
			nutrients: [
				{ nutrient_id: "kcal", name: "Energia", value: 120 },
				{ nutrient_id: "sodio", name: "Sódio", value: 2 },
			],
		})
		const diff = computeIngredientDiff(prev, curr)
		const byKind = Object.fromEntries(diff.nutrients.map((n) => [n.id, n.kind]))
		expect(byKind).toEqual({ kcal: "changed", sodio: "added", prot: "removed" })
	})

	test("nutriente com mesmo valor não gera changed", () => {
		const prev = snapshot({ nutrients: [{ nutrient_id: "kcal", name: "Energia", value: 100 }] })
		const curr = snapshot({ nutrients: [{ nutrient_id: "kcal", name: "Energia", value: 100 }] })
		expect(computeIngredientDiff(prev, curr).nutrients).toEqual([])
	})

	test("item de produto: só reporta os campos que mudaram", () => {
		const base = {
			id: "pi1",
			description: "Pacote 1kg",
			barcode: "789",
			purchase_measure_unit: "un",
			unit_content_quantity: 1,
			correction_factor: 1,
			purchase_item_id: "x",
		}
		const prev = snapshot({ product_items: [base] })
		const curr = snapshot({ product_items: [{ ...base, unit_content_quantity: 2 }] })
		const diff = computeIngredientDiff(prev, curr)
		expect(diff.productItems).toHaveLength(1)
		expect(diff.productItems[0].kind).toBe("changed")
		expect(diff.productItems[0].details.map((d) => d.label)).toEqual(["Conteúdo"])
	})

	test("vínculo de compra: flag is_default booleana é formatada Sim/Não", () => {
		const link = {
			link_id: "l1",
			purchase_item_id: "pi1",
			description: "Fornecedor A",
			catmat_item_codigo: 123,
			catmat_item_descricao: null,
			purchase_measure_unit: "kg",
			unit_price: 10,
			conversion_factor: 1,
			is_default: false,
		}
		const prev = snapshot({ purchase_links: [link] })
		const curr = snapshot({ purchase_links: [{ ...link, is_default: true }] })
		const diff = computeIngredientDiff(prev, curr)
		expect(diff.purchaseLinks[0].details).toEqual([{ label: "Padrão", from: "Não", to: "Sim" }])
	})
})

describe("summarizeDiff", () => {
	test("resume campos por nome e seções por contagem +/−/~", () => {
		const prev = snapshot({ nutrients: [{ nutrient_id: "prot", name: "Proteína", value: 5 }] })
		const curr = snapshot({
			ingredient: { ...snapshot().ingredient, description: "Novo" },
			nutrients: [
				{ nutrient_id: "kcal", name: "Energia", value: 100 },
				{ nutrient_id: "sodio", name: "Sódio", value: 2 },
			],
		})
		const chips = summarizeDiff(computeIngredientDiff(prev, curr))
		expect(chips).toContain("Nome")
		// 2 adicionados (kcal, sodio), 1 removido (prot)
		expect(chips).toContain("Nutrientes +2 −1")
	})

	test("diff vazio não gera chips", () => {
		expect(summarizeDiff(computeIngredientDiff(snapshot(), snapshot()))).toEqual([])
	})
})
