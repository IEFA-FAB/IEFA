/**
 * Caracterização da especificação na conferência: qual especificação vale (a da linha, senão a
 * padrão não excluída) e o que a tela de conferência mostra por linha.
 */
import { describe, expect, test } from "vitest"
import {
	activeDefaultSpec,
	defaultSpecsByIngredient,
	fallbackIngredientIds,
	groupLotsByItem,
	indexById,
	narrowSpec,
	needsDefaultSpec,
	needsDefaultSpecForItem,
	receiptItemDetails,
	resolveRequiredRange,
} from "@/lib/receipt-spec"

describe("requiredRangeFor — resolução da especificação", () => {
	test("lê a padrão só quando a da linha falta ou não tem classe", () => {
		expect(needsDefaultSpec(null)).toBe(true)
		expect(needsDefaultSpec({ conservation_class: null })).toBe(true)
		expect(needsDefaultSpec({})).toBe(true)
		expect(needsDefaultSpec({ conservation_class: "congelado" })).toBe(false)
	})

	test("padrão do embed: excluída não vale; ausente é nula", () => {
		expect(activeDefaultSpec(null)).toBeNull()
		expect(activeDefaultSpec({ purchase_item: null })).toBeNull()
		expect(activeDefaultSpec({})).toBeNull()
		expect(activeDefaultSpec({ purchase_item: { conservation_class: "seco", deleted_at: "2026-01-01" } })).toBeNull()
		const live = { conservation_class: "seco", deleted_at: null }
		expect(activeDefaultSpec({ purchase_item: live })).toBe(live)
	})

	test("faixa e validade da linha; classe da padrão quando a da linha é nula", () => {
		const line = { conservation_class: null, storage_temp_min_c: "-18", storage_temp_max_c: -12, min_shelf_life_days_on_delivery: 30 }
		const fallback = { conservation_class: "congelado", storage_temp_min_c: 0, storage_temp_max_c: 5, min_shelf_life_days_on_delivery: 2 }
		expect(resolveRequiredRange(line, fallback)).toEqual({ minC: -18, maxC: -12, conservationClass: "congelado", minShelfLifeDays: 30 })
	})

	test("sem linha, tudo da padrão", () => {
		expect(
			resolveRequiredRange(null, { conservation_class: "resfriado", storage_temp_min_c: 0, storage_temp_max_c: 5, min_shelf_life_days_on_delivery: null })
		).toEqual({
			minC: 0,
			maxC: 5,
			conservationClass: "resfriado",
			minShelfLifeDays: null,
		})
	})

	test("sem especificação nenhuma, tudo nulo; zero continua zero", () => {
		expect(resolveRequiredRange(null, null)).toEqual({ minC: null, maxC: null, conservationClass: null, minShelfLifeDays: null })
		expect(
			resolveRequiredRange({ conservation_class: "seco", storage_temp_min_c: 0, storage_temp_max_c: null, min_shelf_life_days_on_delivery: 0 }, null)
		).toEqual({
			minC: 0,
			maxC: null,
			conservationClass: "seco",
			minShelfLifeDays: 0,
		})
	})

	test("classe da linha vence a da padrão", () => {
		expect(resolveRequiredRange({ conservation_class: "resfriado" }, { conservation_class: "congelado" }).conservationClass).toBe("resfriado")
	})
})

describe("fetchReceiptFn — linhas da conferência", () => {
	const spec = (id: string, conservation: string | null, deleted: string | null = null) => ({
		id,
		conservation_class: conservation,
		package_type: null,
		transport_requirement: null,
		deleted_at: deleted,
	})

	test("lotes agrupados por linha, na ordem em que vieram", () => {
		const lots = [
			{ id: "l1", receipt_item_id: "a", conservation_class: "seco" },
			{ id: "l2", receipt_item_id: "b", conservation_class: null },
			{ id: "l3", receipt_item_id: "a", conservation_class: "congelado" },
		]
		const grouped = groupLotsByItem(lots)
		expect(grouped.get("a")?.map((lot) => lot.id)).toEqual(["l1", "l3"])
		expect(grouped.get("b")?.map((lot) => lot.id)).toEqual(["l2"])
		expect(groupLotsByItem(null).size).toBe(0)
	})

	test("índice por id aceita leitura nula", () => {
		expect(indexById(null, (row: { id: string }) => row).size).toBe(0)
		expect(indexById([{ id: "x", gtin: "789" }], (row) => row.gtin).get("x")).toBe("789")
	})

	test("cai na padrão: com insumo, e sem item de compra ou com ele sem classe", () => {
		const specById = new Map([
			["pi-classe", narrowSpec(spec("pi-classe", "seco"))],
			["pi-sem-classe", narrowSpec(spec("pi-sem-classe", null))],
		])
		expect(needsDefaultSpecForItem({ ingredient_id: null, purchase_item_id: null }, specById)).toBe(false)
		expect(needsDefaultSpecForItem({ ingredient_id: "i", purchase_item_id: null }, specById)).toBe(true)
		expect(needsDefaultSpecForItem({ ingredient_id: "i", purchase_item_id: "pi-sem-classe" }, specById)).toBe(true)
		expect(needsDefaultSpecForItem({ ingredient_id: "i", purchase_item_id: "pi-desconhecido" }, specById)).toBe(true)
		expect(needsDefaultSpecForItem({ ingredient_id: "i", purchase_item_id: "pi-classe" }, specById)).toBe(false)
	})

	test("insumos da padrão sem repetição", () => {
		const specById = new Map([["pi-classe", narrowSpec(spec("pi-classe", "seco"))]])
		expect(
			fallbackIngredientIds(
				[
					{ ingredient_id: "i1", purchase_item_id: null },
					{ ingredient_id: "i1", purchase_item_id: null },
					{ ingredient_id: "i2", purchase_item_id: "pi-classe" },
					{ ingredient_id: null, purchase_item_id: null },
					{ ingredient_id: "i3", purchase_item_id: "pi-outro" },
				],
				specById
			)
		).toEqual(["i1", "i3"])
	})

	test("padrão por insumo: excluída e ausente ficam fora", () => {
		const map = defaultSpecsByIngredient([
			{ ingredient_id: "i1", purchase_item: spec("p1", "congelado") },
			{ ingredient_id: "i2", purchase_item: spec("p2", "seco", "2026-01-01") },
			{ ingredient_id: "i3", purchase_item: null },
		])
		expect([...map.keys()]).toEqual(["i1"])
		expect(map.get("i1")?.conservation_class).toBe("congelado")
		expect(defaultSpecsByIngredient(null).size).toBe(0)
	})

	const lineSpec = narrowSpec(spec("pi-1", "resfriado"))
	const lineSpecWithoutClass = narrowSpec(spec("pi-2", null))
	const defaultSpec = narrowSpec(spec("pd-1", "congelado"))
	const lookup = {
		specById: new Map([
			["pi-1", lineSpec],
			["pi-2", lineSpecWithoutClass],
		]),
		defaultSpecByIngredient: new Map([["ing-1", defaultSpec]]),
		names: new Map([["ing-1", { description: "Carne bovina", measure_unit: "kg" }]]),
		gtinByItemId: new Map<string, string | null>([
			["sku-1", "7891234567890"],
			["sku-2", null],
		]),
		lotsByItem: new Map([["it-1", [{ id: "lot-1" }]]]),
	}

	test("linha com especificação própria com classe: ela é o acondicionamento e a sugestão", () => {
		expect(receiptItemDetails({ id: "it-1", ingredient_id: "ing-1", purchase_item_id: "pi-1", ingredient_item_id: "sku-1" }, lookup)).toEqual({
			description: "Carne bovina",
			measure_unit: "kg",
			gtin: "7891234567890",
			conditioning: lineSpec,
			suggested_conservation_class: "resfriado",
			lots: [{ id: "lot-1" }],
		})
	})

	test("linha com especificação sem classe: acondicionamento da linha, classe da padrão", () => {
		const details = receiptItemDetails({ id: "it-2", ingredient_id: "ing-1", purchase_item_id: "pi-2", ingredient_item_id: "sku-2" }, lookup)
		expect(details.conditioning).toBe(lineSpecWithoutClass)
		expect(details.suggested_conservation_class).toBe("congelado")
		expect(details.gtin).toBeNull()
		expect(details.lots).toEqual([])
	})

	test("linha sem item de compra: tudo da padrão", () => {
		const details = receiptItemDetails({ id: "it-3", ingredient_id: "ing-1", purchase_item_id: null, ingredient_item_id: null }, lookup)
		expect(details.conditioning).toBe(defaultSpec)
		expect(details.suggested_conservation_class).toBe("congelado")
		expect(details.gtin).toBeNull()
	})

	test("linha sem insumo nem especificação: descrição de traço e tudo nulo", () => {
		expect(receiptItemDetails({ id: "it-4", ingredient_id: null, purchase_item_id: null, ingredient_item_id: "sku-desconhecido" }, lookup)).toEqual({
			description: "—",
			measure_unit: null,
			gtin: null,
			conditioning: null,
			suggested_conservation_class: null,
			lots: [],
		})
	})

	test("insumo sem padrão e linha sem classe: sugestão nula", () => {
		const details = receiptItemDetails({ id: "it-5", ingredient_id: "ing-sem-padrao", purchase_item_id: "pi-2", ingredient_item_id: null }, lookup)
		expect(details.suggested_conservation_class).toBeNull()
		expect(details.description).toBe("—")
	})
})
