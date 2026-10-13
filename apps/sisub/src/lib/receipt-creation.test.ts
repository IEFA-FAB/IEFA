/**
 * Caracterização da criação do recebimento: OF e empenho que sustentam a entrega, as recusas da
 * criação pela NF-e e as linhas e avisos da entrega sem nota.
 */
import { describe, expect, test } from "vitest"
import {
	buildWithoutInvoiceItemRows,
	buildWithoutInvoiceReceiptRow,
	collectKnownIngredientLabels,
	collectWithoutInvoiceProblems,
	computeInvoiceLineValue,
	defaultPurchaseItems,
	describeLinkedDeliveriesProblem,
	describeNfeItemsReceivingProblem,
	formatLotNotSavedWarning,
	formatNfeReceiptInsertMessage,
	formatQuantityNotRecordedWarning,
	formatShelfLifeNotCheckedWarning,
	indexItemsByIngredient,
	itemsInsertFailureMessage,
	prepareNfeReceiptItems,
	type ReceiptWithoutInvoiceData,
	resolveEmpenhoFromOrder,
	resolveUsableEmpenho,
	toNullableNumber,
} from "@/lib/receipt-creation"

const KITCHEN = 7

describe("toNullableNumber", () => {
	test("nulo fica nulo; zero e texto viram número", () => {
		expect(toNullableNumber(null)).toBeNull()
		expect(toNullableNumber(undefined)).toBeNull()
		expect(toNullableNumber(0)).toBe(0)
		expect(toNullableNumber("12")).toBe(12)
	})
})

describe("resolveEmpenhoFromOrder — a OF sustenta a entrega", () => {
	const order = { kitchen_id: KITCHEN, empenho_id: "ne-1", status: "sent" }

	test("OF ausente ou de outra cozinha", () => {
		expect(resolveEmpenhoFromOrder(null, KITCHEN, null)).toEqual({ ok: false, problem: "OF não encontrada ou de outra cozinha" })
		expect(resolveEmpenhoFromOrder({ ...order, kitchen_id: 8 }, KITCHEN, null)).toEqual({ ok: false, problem: "OF não encontrada ou de outra cozinha" })
	})

	test("cozinha como texto é comparada como número", () => {
		expect(resolveEmpenhoFromOrder({ ...order, kitchen_id: String(KITCHEN) }, KITCHEN, null)).toEqual({ ok: true, value: "ne-1" })
	})

	test("rascunho e cancelada não sustentam", () => {
		for (const status of ["draft", "cancelled"]) {
			expect(resolveEmpenhoFromOrder({ ...order, status }, KITCHEN, null)).toEqual({
				ok: false,
				problem: "Só OF enviada sustenta a entrega — envie a OF ou registre sem ela",
			})
		}
	})

	test("OF com empenho: vale o dela; outro empenho pedido é recusado", () => {
		expect(resolveEmpenhoFromOrder(order, KITCHEN, null)).toEqual({ ok: true, value: "ne-1" })
		expect(resolveEmpenhoFromOrder(order, KITCHEN, "ne-1")).toEqual({ ok: true, value: "ne-1" })
		expect(resolveEmpenhoFromOrder(order, KITCHEN, "ne-2")).toEqual({
			ok: false,
			problem: "A OF é de outro empenho — escolha o empenho da OF, ou registre sem OF",
		})
	})

	test("OF aguardando empenho: NE pedida é recusada; sem NE, segue sem empenho", () => {
		const awaiting = { ...order, empenho_id: null, status: "partially_received" }
		expect(resolveEmpenhoFromOrder(awaiting, KITCHEN, "ne-2")).toEqual({
			ok: false,
			problem: "A OF está aguardando empenho: vincule a NE na própria OF, que confere o SICAF — ou registre a entrega com a OF e sem NE",
		})
		expect(resolveEmpenhoFromOrder(awaiting, KITCHEN, null)).toEqual({ ok: true, value: null })
	})
})

describe("resolveUsableEmpenho — o empenho sustenta a entrega", () => {
	const row = { unit_id: 5, status: "ativo", favorecido_nome: "Padaria", favorecido_cnpj: "123" }

	test("ausente, cozinha sem unidade ou de outra unidade", () => {
		const problem = { ok: false, problem: "Empenho não encontrado nesta unidade" }
		expect(resolveUsableEmpenho(null, 5)).toEqual(problem)
		expect(resolveUsableEmpenho(row, null)).toEqual(problem)
		expect(resolveUsableEmpenho({ ...row, unit_id: 6 }, 5)).toEqual(problem)
	})

	test("anulado não sustenta", () => {
		expect(resolveUsableEmpenho({ ...row, status: "anulado" }, 5)).toEqual({
			ok: false,
			problem: "Empenho anulado não sustenta entrega — registre sem empenho e vincule a NE vigente depois",
		})
	})

	test("vigente da unidade (unidade como texto)", () => {
		expect(resolveUsableEmpenho({ ...row, unit_id: "5" }, 5)).toEqual({ ok: true, value: { ...row, unit_id: "5" } })
	})
})

describe("recebimento a partir da NF-e", () => {
	test("nota que já fecha entregas sem nota", () => {
		expect(describeLinkedDeliveriesProblem(null)).toBeNull()
		expect(describeLinkedDeliveriesProblem(0)).toBeNull()
		expect(describeLinkedDeliveriesProblem(2)).toBe(
			"Esta NF-e já está vinculada a 2 entrega(s) recebida(s) sem nota — não crie outro recebimento: confira os itens nas entregas vinculadas"
		)
	})

	const item = (id: string, ingredient: string | null, nItem: number | null = 1, description: string | null = "Arroz") => ({
		id,
		n_item: nItem,
		description,
		ingredient_id: ingredient,
	})

	test("nenhum item casado (inclusive nota sem itens)", () => {
		const message = "Nenhum item da NF-e está vinculado a um insumo — resolva o matching antes de receber"
		expect(describeNfeItemsReceivingProblem([])).toBe(message)
		expect(describeNfeItemsReceivingProblem([item("a", null)])).toBe(message)
	})

	test("todos casados passam", () => {
		expect(describeNfeItemsReceivingProblem([item("a", "ing-1")])).toBeNull()
	})

	test("parte sem insumo: até 5 descritas pelo nº e descrição; sem nº, '?'; sem descrição, o id", () => {
		expect(describeNfeItemsReceivingProblem([item("a", "ing-1"), item("b", null, null, null), item("c", null, 3, "Feijão")])).toBe(
			"2 item(ns) da NF-e ainda sem insumo vinculado — resolva o matching antes de receber (itens: #? b; #3 Feijão)"
		)
	})

	test("mais de 5 sem insumo: reticências", () => {
		const items = [item("ok", "ing-1"), ...Array.from({ length: 6 }, (_, i) => item(`x${i}`, null, i + 1, `Item ${i + 1}`))]
		expect(describeNfeItemsReceivingProblem(items)).toBe(
			"6 item(ns) da NF-e ainda sem insumo vinculado — resolva o matching antes de receber (itens: #1 Item 1; #2 Item 2; #3 Item 3; #4 Item 4; #5 Item 5…)"
		)
	})

	test("falha ao inserir: chave única tem frase própria", () => {
		expect(formatNfeReceiptInsertMessage({ code: "23505", message: "duplicate" })).toBe("Esta NF-e já tem um recebimento em andamento ou efetivado")
		expect(formatNfeReceiptInsertMessage(null)).toMatch(/^Erro ao criar recebimento: /)
	})

	test("linhas do recebimento com custo na unidade base e o rastro do lote", () => {
		const prepared = prepareNfeReceiptItems(
			[
				{
					id: "nf-1",
					ingredient_id: "ing-1",
					ingredient_item_id: "sku-1",
					purchase_item_id: "pi-1",
					matched_qty_base: 30,
					unit_price: 10,
					commercial_qty: 6,
					lot_code: "L1",
					expiry_date: "2026-11-01",
				},
				{
					id: "nf-2",
					ingredient_id: "ing-2",
					ingredient_item_id: null,
					purchase_item_id: null,
					matched_qty_base: null,
					unit_price: 5,
					commercial_qty: 2,
					lot_code: null,
					expiry_date: null,
				},
			],
			"gr-1"
		)
		expect(prepared).toEqual([
			{
				row: {
					receipt_id: "gr-1",
					nfe_item_id: "nf-1",
					ingredient_id: "ing-1",
					frozen_preparation_id: null,
					ingredient_item_id: "sku-1",
					purchase_item_id: "pi-1",
					invoiced_qty_base: 30,
					received_qty_base: 30,
					unit_cost: 2,
				},
				lotCode: "L1",
				expiryDate: "2026-11-01",
			},
			{
				row: {
					receipt_id: "gr-1",
					nfe_item_id: "nf-2",
					ingredient_id: "ing-2",
					frozen_preparation_id: null,
					ingredient_item_id: null,
					purchase_item_id: null,
					invoiced_qty_base: null,
					received_qty_base: 0,
					unit_cost: null,
				},
				lotCode: null,
				expiryDate: null,
			},
		])
	})
})

describe("computeInvoiceLineValue — valor da linha da nota", () => {
	const nfe = { acquisition_cost: null, product_value: null, unit_price: null, commercial_qty: null }

	test("custo de aquisição primeiro, depois valor do produto, depois preço × quantidade", () => {
		expect(computeInvoiceLineValue({ acquisition_cost: 900, product_value: 825, unit_price: 27.5, commercial_qty: 30 })).toBe(900)
		expect(computeInvoiceLineValue({ ...nfe, product_value: 825, unit_price: 27.5, commercial_qty: 30 })).toBe(825)
		expect(computeInvoiceLineValue({ ...nfe, unit_price: 27.5, commercial_qty: 30 })).toBe(825)
	})

	test("zero não cai para o próximo (é `??`, não `||`)", () => {
		expect(computeInvoiceLineValue({ ...nfe, acquisition_cost: 0, product_value: 825 })).toBe(0)
	})

	test("sem preço ou sem quantidade, ou sem item: nulo", () => {
		expect(computeInvoiceLineValue({ ...nfe, unit_price: 27.5 })).toBeNull()
		expect(computeInvoiceLineValue({ ...nfe, commercial_qty: 30 })).toBeNull()
		expect(computeInvoiceLineValue(null)).toBeNull()
	})

	test("valor vindo como texto vira número", () => {
		expect(computeInvoiceLineValue({ ...nfe, acquisition_cost: "12.5" as unknown as number })).toBe(12.5)
	})
})

describe("entrega sem NF-e", () => {
	const data: ReceiptWithoutInvoiceData = {
		kitchenId: KITCHEN,
		source: "delivery_note",
		deliveryNoteNumber: " R-1 ",
		supplierName: "  ",
		supplierDocument: "12.345.678/0001-90",
		invoiceExpected: true,
		supplyOrderId: undefined,
		notes: "  pão  ",
		lines: [
			{ ingredientId: "ing-1", quantityBase: 10, unitCost: 1.5 },
			{ ingredientId: "ing-2", quantityBase: 5 },
		],
	}

	test("problemas: guia sem número e documento inválido", () => {
		expect(collectWithoutInvoiceProblems(data)).toEqual([])
		expect(collectWithoutInvoiceProblems({ ...data, deliveryNoteNumber: undefined, supplierDocument: "123" })).toEqual([
			"Informe o número da guia de remessa — sem número, registre como entrega sem documento",
			"Documento do fornecedor inválido: informe o CNPJ (14 dígitos) ou o CPF (11)",
		])
	})

	test("insumos vivos com a descrição; excluídos ficam fora; leitura nula é vazia", () => {
		const known = collectKnownIngredientLabels([
			{ id: "ing-1", description: "Pão francês", deleted_at: null },
			{ id: "ing-2", description: "Leite", deleted_at: "2026-01-01" },
		])
		expect([...known.keys()]).toEqual(["ing-1"])
		expect(known.get("ing-1")).toBeTruthy()
		expect(collectKnownIngredientLabels(null).size).toBe(0)
	})

	test("especificação padrão por insumo", () => {
		expect([...defaultPurchaseItems([{ ingredient_id: "ing-1", purchase_item_id: "pi-1" }]).entries()]).toEqual([["ing-1", "pi-1"]])
		expect(defaultPurchaseItems(null).size).toBe(0)
	})

	test("recebimento: fornecedor em branco cai no favorecido; documento só com dígitos; textos aparados", () => {
		expect(
			buildWithoutInvoiceReceiptRow(data, { empenhoId: "ne-1", empenho: { favorecido_nome: "Padaria do Empenho", favorecido_cnpj: "99" } }, "user-1")
		).toEqual({
			kitchen_id: KITCHEN,
			source: "delivery_note",
			delivery_note_number: "R-1",
			supplier_name: "Padaria do Empenho",
			supplier_document: "12345678000190",
			invoice_expected: true,
			supply_order_id: null,
			empenho_id: "ne-1",
			notes: "pão",
			created_by: "user-1",
		})
	})

	test("recebimento sem empenho e sem textos: nulos; documento em branco cai no do empenho", () => {
		const row = buildWithoutInvoiceReceiptRow(
			{
				...data,
				source: "ad_hoc",
				deliveryNoteNumber: null,
				supplierName: "Fornecedor",
				supplierDocument: "",
				notes: "  ",
				supplyOrderId: "of-1",
				invoiceExpected: false,
			},
			{ empenhoId: null, empenho: null },
			"user-1"
		)
		expect(row).toMatchObject({
			source: "ad_hoc",
			delivery_note_number: null,
			supplier_name: "Fornecedor",
			supplier_document: null,
			invoice_expected: false,
			supply_order_id: "of-1",
			empenho_id: null,
			notes: null,
		})
		expect(
			buildWithoutInvoiceReceiptRow({ ...data, supplierDocument: null }, { empenhoId: "ne-1", empenho: { favorecido_nome: null, favorecido_cnpj: "99" } }, "u")
		).toMatchObject({ supplier_name: null, supplier_document: "99" })
	})

	test("linhas sem faturado, com a especificação padrão e o custo informado", () => {
		expect(buildWithoutInvoiceItemRows(data.lines, "gr-1", new Map([["ing-1", "pi-1"]]))).toEqual([
			{
				receipt_id: "gr-1",
				ingredient_id: "ing-1",
				frozen_preparation_id: null,
				purchase_item_id: "pi-1",
				invoiced_qty_base: null,
				received_qty_base: 0,
				unit_cost: 1.5,
			},
			{
				receipt_id: "gr-1",
				ingredient_id: "ing-2",
				frozen_preparation_id: null,
				purchase_item_id: null,
				invoiced_qty_base: null,
				received_qty_base: 0,
				unit_cost: null,
			},
		])
	})

	test("falha ao inserir as linhas, com e sem falha do rollback", () => {
		expect(itemsInsertFailureMessage(null, null)).toMatch(/^Erro ao registrar os itens da entrega: [^(]*$/)
		expect(itemsInsertFailureMessage(null, { code: "P0001", message: "trava" })).toMatch(/ \(e o recebimento vazio ficou em rascunho: .*\)$/)
	})

	test("item por insumo; linha sem insumo fica fora; o último vence", () => {
		const map = indexItemsByIngredient([
			{ id: "it-1", ingredient_id: "ing-1", purchase_item_id: null },
			{ id: "it-2", ingredient_id: null, purchase_item_id: "pi" },
			{ id: "it-3", ingredient_id: "ing-1", purchase_item_id: "pi-1" },
		])
		expect([...map.entries()]).toEqual([["ing-1", { id: "it-3", ingredient_id: "ing-1", purchase_item_id: "pi-1" }]])
	})

	test("avisos por linha", () => {
		expect(formatQuantityNotRecordedWarning("Pão", new Error("trava"))).toBe("Pão: quantidade não registrada (trava) — informe na conferência")
		expect(formatQuantityNotRecordedWarning("Pão", "texto")).toBe("Pão: quantidade não registrada (erro) — informe na conferência")
		expect(formatShelfLifeNotCheckedWarning("Pão", new Error("sem spec"))).toBe(
			"Pão: validade mínima não conferida (sem spec) — informe lote e validade na conferência"
		)
		expect(formatShelfLifeNotCheckedWarning("Pão", 42)).toBe("Pão: validade mínima não conferida (erro) — informe lote e validade na conferência")
		expect(formatLotNotSavedWarning("Pão", { code: "P0001", message: "x" })).toMatch(/^Pão: lote e validade não gravados \(.*\) — informe na conferência$/)
	})
})
