import { describe, expect, test } from "bun:test"
import {
	type InvoiceItemForLink,
	matchReceiptLinesToInvoice,
	type ReceiptLineForLink,
	receiptLinkWarnings,
	receiptWithoutInvoiceProblems,
} from "./receiving-links.ts"

const line = (id: string, over: Partial<ReceiptLineForLink> = {}): ReceiptLineForLink => ({
	id,
	ingredientId: `ing-${id}`,
	purchaseItemId: null,
	nfeItemId: null,
	unitCost: null,
	...over,
})
const item = (id: string, over: Partial<InvoiceItemForLink> = {}): InvoiceItemForLink => ({
	id,
	nItem: 1,
	description: null,
	ingredientId: null,
	purchaseItemId: null,
	matchedQtyBase: null,
	unitPrice: null,
	commercialQty: null,
	...over,
})

describe("matchReceiptLinesToInvoice", () => {
	test("pão da segunda casa com o item da nota semanal, com o custo da LINHA DA NOTA", () => {
		// NF-e da semana: 35 kg de pão a R$ 14/kg. A entrega de segunda foi de 7 kg.
		const nota = [item("n1", { ingredientId: "pao", matchedQtyBase: 35, unitPrice: 14, commercialQty: 35 })]
		const match = matchReceiptLinesToInvoice([line("seg", { ingredientId: "pao" })], nota)
		expect(match.links).toEqual([{ receiptItemId: "seg", nfeItemId: "n1" }])
		// 490 / 35 = 14 — nunca 490 / 7 = 70
		expect(match.costs).toEqual([{ receiptItemId: "seg", unitCost: 14 }])
		expect(match.unmatchedLineIds).toEqual([])
	})

	test("cinco entregas da semana podem casar com o MESMO item da nota", () => {
		const nota = [item("n1", { ingredientId: "pao" })]
		for (const day of ["seg", "ter", "qua", "qui", "sex"]) {
			expect(matchReceiptLinesToInvoice([line(day, { ingredientId: "pao" })], nota).links).toEqual([{ receiptItemId: day, nfeItemId: "n1" }])
		}
	})

	test("insumo casa antes do item de compra; sem insumo, o item de compra desempata", () => {
		const nota = [item("n1", { purchaseItemId: "pi-leite" }), item("n2", { nItem: 2, ingredientId: "leite" })]
		expect(matchReceiptLinesToInvoice([line("a", { ingredientId: "leite", purchaseItemId: "pi-leite" })], nota).links[0].nfeItemId).toBe("n2")
		expect(matchReceiptLinesToInvoice([line("b", { ingredientId: "outro", purchaseItemId: "pi-leite" })], nota).links[0].nfeItemId).toBe("n1")
	})

	test("dois itens possíveis: a linha pega o primeiro livre na ordem da nota e fica marcada como ambígua", () => {
		const nota = [item("n2", { nItem: 2, ingredientId: "arroz" }), item("n1", { nItem: 1, ingredientId: "arroz" })]
		const match = matchReceiptLinesToInvoice([line("a", { ingredientId: "arroz" })], nota)
		expect(match.links).toEqual([{ receiptItemId: "a", nfeItemId: "n1" }])
		expect(match.ambiguousLineIds).toEqual(["a"])
		expect(match.unusedInvoiceItemIds).toEqual(["n2"])
	})

	test("linha já ligada ao item desta nota fica como está e reserva o item", () => {
		const nota = [item("n1", { ingredientId: "arroz" }), item("n2", { nItem: 2, ingredientId: "arroz" })]
		const match = matchReceiptLinesToInvoice([line("a", { ingredientId: "arroz", nfeItemId: "n1" }), line("b", { ingredientId: "arroz" })], nota)
		expect(match.links).toEqual([{ receiptItemId: "b", nfeItemId: "n2" }])
	})

	test("linha sem item na nota é dita, não inventada; linha com custo não é recalculada", () => {
		const nota = [item("n1", { ingredientId: "arroz", matchedQtyBase: 10, unitPrice: 5, commercialQty: 10 })]
		const match = matchReceiptLinesToInvoice([line("a", { ingredientId: "arroz", unitCost: 4.5 }), line("b", { ingredientId: "feijao" })], nota)
		expect(match.unmatchedLineIds).toEqual(["b"])
		expect(match.costs).toEqual([])
	})

	test("nota só pela chave (sem itens): nada casa, todas as linhas ficam sem vínculo", () => {
		const match = matchReceiptLinesToInvoice([line("a")], [])
		expect(match.links).toEqual([])
		expect(match.unmatchedLineIds).toEqual(["a"])
	})
})

describe("receiptLinkWarnings", () => {
	const base = {
		receiptSupplierDocument: null,
		empenhoSupplierCnpj: null,
		invoiceSupplierDocument: "12.345.678/0001-90",
		invoiceHasItems: true,
		attested: false,
	}

	test("sem conflito, sem aviso", () => {
		expect(receiptLinkWarnings({ ...base, receiptSupplierDocument: "12345678000190", empenhoSupplierCnpj: "12345678000190" })).toEqual([])
	})

	test("emitente diferente de quem entregou e do favorecido do empenho", () => {
		const warnings = receiptLinkWarnings({ ...base, receiptSupplierDocument: "99999999000199", empenhoSupplierCnpj: "88888888000188" })
		expect(warnings).toHaveLength(2)
		expect(warnings[1]).toMatch(/Lei 4.320, art. 63/)
	})

	test("nota sem XML e recebimento já efetivado avisam o que o vínculo não faz", () => {
		const warnings = receiptLinkWarnings({ ...base, invoiceHasItems: false, attested: true })
		expect(warnings.some((w) => /XML/.test(w))).toBe(true)
		expect(warnings.some((w) => /não muda quantidade, custo nem estoque/.test(w))).toBe(true)
	})
})

describe("receiptWithoutInvoiceProblems", () => {
	const ok = { source: "ad_hoc" as const, deliveryNoteNumber: null, supplierDocument: null, lines: [{ ingredientId: "pao", quantityBase: 7 }] }

	test("entrega sem documento com uma linha passa", () => {
		expect(receiptWithoutInvoiceProblems(ok)).toEqual([])
	})

	test("guia exige número", () => {
		expect(receiptWithoutInvoiceProblems({ ...ok, source: "delivery_note" })[0]).toMatch(/número da guia/)
		expect(receiptWithoutInvoiceProblems({ ...ok, source: "delivery_note", deliveryNoteNumber: "GR-88" })).toEqual([])
	})

	test("documento do fornecedor tem de ser CNPJ ou CPF", () => {
		expect(receiptWithoutInvoiceProblems({ ...ok, supplierDocument: "123" })[0]).toMatch(/CNPJ/)
		expect(receiptWithoutInvoiceProblems({ ...ok, supplierDocument: "123.456.789-09" })).toEqual([])
	})

	test("sem linha, quantidade zero e insumo repetido são recusados com instrução", () => {
		expect(receiptWithoutInvoiceProblems({ ...ok, lines: [] })[0]).toMatch(/ao menos um item/)
		expect(receiptWithoutInvoiceProblems({ ...ok, lines: [{ ingredientId: "pao", quantityBase: 0 }] })[0]).toMatch(/maior que zero/)
		const repeated = receiptWithoutInvoiceProblems({
			...ok,
			lines: [
				{ ingredientId: "pao", quantityBase: 3 },
				{ ingredientId: "pao", quantityBase: 4 },
			],
		})
		expect(repeated[0]).toMatch(/validades diferentes vão nos lotes/)
	})
})
