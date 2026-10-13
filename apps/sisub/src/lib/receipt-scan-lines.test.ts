/**
 * Caracterização das linhas da conferência por leitura: nota, catálogo (SKU + aliases) e
 * hierarquia de embalagem por SKU.
 */
import { describe, expect, test } from "vitest"
import { collectCatalogGtinsBySku, collectHierarchyGtinsBySku, indexInvoiceItems, toScanLine } from "@/lib/receipt-scan-lines"

describe("o que a nota declara", () => {
	test("por item da nota; leitura nula é vazia", () => {
		const item = { id: "nf-1", gtin: "7891", gtin_trib: "1789", commercial_qty: 2, taxable_qty: 24 }
		expect(indexInvoiceItems([item]).get("nf-1")).toBe(item)
		expect(indexInvoiceItems(null).size).toBe(0)
	})
})

describe("o que o catálogo conhece", () => {
	test("GTIN do SKU primeiro, aliases na ordem; SKU sem GTIN só com alias", () => {
		const catalog = collectCatalogGtinsBySku(
			[
				{ id: "sku-1", gtin: "A" },
				{ id: "sku-2", gtin: null },
				{ id: "sku-3", gtin: "" },
			],
			[
				{ gtin: "B", ingredient_item_id: "sku-1" },
				{ gtin: "C", ingredient_item_id: "sku-2" },
				{ gtin: "D", ingredient_item_id: "sku-1" },
			]
		)
		expect([...catalog.entries()]).toEqual([
			["sku-1", ["A", "B", "D"]],
			["sku-2", ["C"]],
		])
	})

	test("leituras nulas não quebram", () => {
		expect(collectCatalogGtinsBySku(null, null).size).toBe(0)
	})
})

describe("hierarquia de embalagem", () => {
	test("filho e pai dos conhecidos entram; o que o item já conhece não; sem repetição", () => {
		const catalog = new Map([
			["sku-1", ["UN"]],
			["sku-2", ["CX2"]],
			["sku-3", ["SOLTO"]],
		])
		const hierarchy = collectHierarchyGtinsBySku(catalog, [
			// caixa da unidade conhecida (pai)
			{ gtin: "UN", parent_gtin: "CX" },
			// fardo que contém a caixa: não é parente direto do conhecido
			{ gtin: "CX", parent_gtin: "FARDO" },
			// unidade dentro da caixa conhecida (filho), duas vezes
			{ gtin: "UN2", parent_gtin: "CX2" },
			{ gtin: "UN2", parent_gtin: "CX2" },
			// nó sem pai não liga nada
			{ gtin: "SOLTO", parent_gtin: null },
		])
		expect([...hierarchy.entries()]).toEqual([
			["sku-1", ["CX"]],
			["sku-2", ["UN2"]],
		])
	})

	test("pai que o item já conhece não se repete", () => {
		const catalog = new Map([["sku-1", ["UN", "CX"]]])
		expect(collectHierarchyGtinsBySku(catalog, [{ gtin: "UN", parent_gtin: "CX" }]).size).toBe(0)
	})

	test("hierarquia nula", () => {
		expect(collectHierarchyGtinsBySku(new Map([["sku-1", ["A"]]]), null).size).toBe(0)
	})
})

describe("linha para o casamento", () => {
	const nfeById = indexInvoiceItems([{ id: "nf-1", gtin: "7891", gtin_trib: null, commercial_qty: 2, taxable_qty: null }])
	const catalog = new Map([["sku-1", ["A", "B"]]])
	const hierarchy = new Map([["sku-1", ["CX"]]])

	test("linha com nota e SKU", () => {
		expect(
			toScanLine({ id: "it-1", nfe_item_id: "nf-1", ingredient_item_id: "sku-1", invoiced_qty_base: 10, received_qty_base: 4 }, nfeById, catalog, hierarchy)
		).toEqual({
			receiptItemId: "it-1",
			invoiceGtin: "7891",
			invoiceGtinTrib: null,
			catalogGtins: ["A", "B"],
			hierarchyGtins: ["CX"],
			commercialQty: 2,
			taxableQty: null,
			invoicedQtyBase: 10,
			confirmedQtyBase: 4,
		})
	})

	test("linha sem nota e sem SKU: listas vazias e nulos; zero faturado continua zero", () => {
		expect(
			toScanLine({ id: "it-2", nfe_item_id: null, ingredient_item_id: null, invoiced_qty_base: 0, received_qty_base: 0 }, nfeById, catalog, hierarchy)
		).toEqual({
			receiptItemId: "it-2",
			invoiceGtin: null,
			invoiceGtinTrib: null,
			catalogGtins: [],
			hierarchyGtins: [],
			commercialQty: null,
			taxableQty: null,
			invoicedQtyBase: 0,
			confirmedQtyBase: 0,
		})
	})

	test("item da nota e SKU desconhecidos", () => {
		const line = toScanLine(
			{ id: "it-3", nfe_item_id: "nf-x", ingredient_item_id: "sku-x", invoiced_qty_base: null, received_qty_base: 1 },
			nfeById,
			catalog,
			hierarchy
		)
		expect(line.invoiceGtin).toBeNull()
		expect(line.catalogGtins).toEqual([])
		expect(line.hierarchyGtins).toEqual([])
		expect(line.invoicedQtyBase).toBeNull()
	})
})
