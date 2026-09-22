import { describe, expect, test } from "vitest"
import type { AtaSnapshotComponent } from "@/types/domain/ata"
import { annexMaxValue, buildAnnexCsv, buildSnapshotAnnexRows } from "./ata-annex"

/** Componente de snapshot mínimo: só os campos que o anexo lê. */
function component(overrides: Partial<AtaSnapshotComponent>): AtaSnapshotComponent {
	return {
		ingredient_id: "ing-1",
		ingredient_name: "Arroz",
		folder_description: "Grãos",
		catmat_item_codigo: null,
		purchase_item_description: null,
		purchase_quantity: null,
		purchase_measure_unit: null,
		measure_unit: "KG",
		total_quantity: 100,
		max_margin_percent: 20,
		max_quantity: 120,
		delivery_cycle: "weekly",
		min_order_quantity: 10,
		unit_price: 10,
		...overrides,
	} as AtaSnapshotComponent
}

describe("buildSnapshotAnnexRows", () => {
	test("preço vem do item vivo: pesquisa de preço depois de publicar reflete no anexo", () => {
		const rows = buildSnapshotAnnexRows([component({})], [{ ingredient_id: "ing-1", item_description: null, catmat_item_descricao: null, unit_price: 12 }])
		expect(rows[0]?.unitPrice).toBe(12)
		// Valor máximo = máxima congelada (120) × preço atual (12).
		expect(annexMaxValue(rows)).toBe(1440)
	})

	test("preço vivo decimal chega ao CSV com 4 casas", () => {
		const rows = buildSnapshotAnnexRows([component({})], [{ ingredient_id: "ing-1", item_description: null, catmat_item_descricao: null, unit_price: 12.5 }])
		expect(rows[0]?.unitPrice).toBe(12.5)
		expect(() => buildAnnexCsv(rows)).not.toThrow()
		expect(buildAnnexCsv(rows)).toContain('"12.5000"')
	})

	test("sem item vivo, cai no preço congelado do snapshot", () => {
		const rows = buildSnapshotAnnexRows([component({})], [])
		expect(rows[0]?.unitPrice).toBe(10)
	})

	test("quantidades continuam do snapshot, mesmo com o item vivo presente", () => {
		const rows = buildSnapshotAnnexRows([component({})], [{ ingredient_id: "ing-1", item_description: "tipo 1", catmat_item_descricao: null, unit_price: 12 }])
		expect(rows[0]?.maxQuantity).toBe(120)
		expect(rows[0]?.minOrderQuantity).toBe(10)
		expect(rows[0]?.itemDescription).toBe("tipo 1")
	})
})

describe("unidade do anexo", () => {
	test("item de compra sem unidade própria herda a do insumo, não cai em UN", () => {
		const rows = buildSnapshotAnnexRows([component({ measure_unit: "LT", purchase_quantity: 100, purchase_measure_unit: null })], [])
		expect(rows[0]?.unit).toBe("LT")
	})

	test("unidade de compra vence a do insumo quando há quantidade de compra", () => {
		const rows = buildSnapshotAnnexRows([component({ measure_unit: "G", purchase_quantity: 0.1, purchase_measure_unit: "KG" })], [])
		expect(rows[0]?.unit).toBe("KG")
	})
})
