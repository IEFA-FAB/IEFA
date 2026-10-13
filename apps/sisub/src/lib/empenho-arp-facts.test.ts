import type { ArpItemFacts } from "@iefa/sisub-domain"
import { describe, expect, it } from "vitest"
import {
	collectArpAcquisitions,
	collectArpItemIds,
	type EmpenhoArpHeaderRow,
	type EmpenhoArpItemRow,
	emptyArpItemsSummary,
	pickArpAcquisition,
	resolveEmpenhoHeaderFields,
	resolveEmpenhoItemFields,
	resolveFavorecido,
	summarizeArpItems,
	toArpItemFacts,
} from "@/lib/empenho-arp-facts"

const CNPJ_A = "12345678000190"
const CNPJ_B = "98765432000110"
const CPF = "12345678901"

const itemRow = (overrides: Partial<EmpenhoArpItemRow> = {}): EmpenhoArpItemRow => ({
	id: "i1",
	arp_id: "arp1",
	numero_item: 1,
	descricao_item: "Arroz",
	ni_fornecedor: CNPJ_A,
	nome_fornecedor: "Fornecedor A",
	valor_unitario: 5,
	quantidade_homologada: 100,
	quantidade_empenhada: 30,
	saldo_empenho: null,
	medida_catmat: "KG",
	...overrides,
})

const arpRow = (overrides: Partial<EmpenhoArpHeaderRow> = {}): EmpenhoArpHeaderRow => ({
	unit_id: 7,
	acquisition_id: null,
	data_vigencia_inicio: "2026-01-01",
	data_vigencia_fim: "2026-12-31",
	last_synced_at: "2026-10-01T00:00:00Z",
	...overrides,
})

describe("collectArpItemIds", () => {
	it("tira vazios e repetidos, na ordem", () => {
		expect(collectArpItemIds([{ arpItemId: "a" }, { arpItemId: null }, {}, { arpItemId: "" }, { arpItemId: "b" }, { arpItemId: "a" }])).toEqual(["a", "b"])
	})
})

describe("toArpItemFacts", () => {
	it("saldo oficial derivado quando a API não trouxe o saldo", () => {
		expect(toArpItemFacts(itemRow(), arpRow(), 12)).toEqual({
			id: "i1",
			numeroItem: 1,
			description: "Arroz",
			unitPrice: 5,
			officialBalance: 70,
			homologatedQuantity: 100,
			localCommitted: 12,
			validFrom: "2026-01-01",
			validTo: "2026-12-31",
		})
	})

	it("sem homologada nem saldo: saldo oficial desconhecido; preço e homologada nulos", () => {
		expect(toArpItemFacts(itemRow({ valor_unitario: null, quantidade_homologada: null, saldo_empenho: null }), arpRow(), 0)).toMatchObject({
			unitPrice: null,
			officialBalance: null,
			homologatedQuantity: null,
		})
	})

	it("só o saldo: usa o saldo", () => {
		expect(toArpItemFacts(itemRow({ quantidade_homologada: null, saldo_empenho: 40 }), arpRow(), 0).officialBalance).toBe(40)
	})
})

describe("summarizeArpItems", () => {
	it("resume itens, fornecedores e sincronização", () => {
		const summary = summarizeArpItems(
			[
				itemRow({ id: "i1", nome_fornecedor: null }),
				itemRow({ id: "i2", arp_id: "arp2", ni_fornecedor: "12.345.678/0001-90", nome_fornecedor: "Fornecedor A", medida_catmat: null }),
				itemRow({ id: "i3", ni_fornecedor: null, nome_fornecedor: "Outro" }),
			],
			new Map([
				["arp1", arpRow()],
				["arp2", arpRow({ unit_id: "7", last_synced_at: null })],
			]),
			new Map([["i1", { quantidade: 5 }]]),
			7
		)
		expect([...summary.arpItems.keys()]).toEqual(["i1", "i2", "i3"])
		expect(summary.arpItems.get("i1")?.localCommitted).toBe(5)
		expect(summary.arpItems.get("i2")?.localCommitted).toBe(0)
		expect([...summary.arpUnitByItem]).toEqual([
			["i1", "KG"],
			["i2", null],
			["i3", "KG"],
		])
		expect([...summary.suppliers]).toEqual([CNPJ_A])
		// o primeiro nome não nulo
		expect(summary.supplierName).toBe("Fornecedor A")
		expect(summary.arpSynced).toBe(false)
	})

	it("sem itens: resumo vazio e sincronizado", () => {
		expect(summarizeArpItems([], new Map(), new Map(), 7)).toEqual(emptyArpItemsSummary())
	})

	it("item de ARP de outra unidade, ou de ARP não achada, recusa", () => {
		expect(() => summarizeArpItems([itemRow()], new Map([["arp1", arpRow({ unit_id: 8 })]]), new Map(), 7)).toThrow(
			"O item da ARP informado não pertence a esta unidade"
		)
		expect(() => summarizeArpItems([itemRow()], new Map(), new Map(), 7)).toThrow("O item da ARP informado não pertence a esta unidade")
	})
})

describe("contratação herdada da ARP", () => {
	it("collectArpAcquisitions tira nulos e repetidos", () => {
		expect(collectArpAcquisitions([{ acquisition_id: "a" }, { acquisition_id: null }, { acquisition_id: "a" }, { acquisition_id: "b" }])).toEqual(["a", "b"])
	})

	it("pickArpAcquisition herda só quando não veio e há uma só", () => {
		expect(pickArpAcquisition(null, ["a"])).toBe("a")
		expect(pickArpAcquisition(null, ["a", "b"])).toBeNull()
		expect(pickArpAcquisition(null, [])).toBeNull()
		expect(pickArpAcquisition("x", ["a"])).toBe("x")
	})
})

describe("resolveFavorecido", () => {
	const base = { informedCnpj: null, informedNome: null, acquisitionSupplier: null, suppliers: new Set<string>(), supplierName: null }

	it("o informado vence", () => {
		expect(
			resolveFavorecido({
				...base,
				informedCnpj: "12.345.678/0001-90",
				informedNome: "  Informado  ",
				acquisitionSupplier: { cnpj: CNPJ_B, name: "Contratação" },
				suppliers: new Set([CNPJ_B]),
				supplierName: "ARP",
			})
		).toEqual({ favorecidoCnpj14: CNPJ_A, favorecidoNome: "Informado" })
	})

	it("sem informado: o da contratação", () => {
		expect(
			resolveFavorecido({
				...base,
				informedNome: "   ",
				acquisitionSupplier: { cnpj: CNPJ_B, name: "Contratação" },
				suppliers: new Set([CNPJ_A]),
				supplierName: "ARP",
			})
		).toEqual({ favorecidoCnpj14: CNPJ_B, favorecidoNome: "Contratação" })
	})

	it("sem informado nem contratação: o fornecedor único da ARP", () => {
		expect(resolveFavorecido({ ...base, acquisitionSupplier: { cnpj: "inválido", name: null }, suppliers: new Set([CNPJ_A]), supplierName: "ARP" })).toEqual({
			favorecidoCnpj14: CNPJ_A,
			favorecidoNome: "ARP",
		})
	})

	it("vários fornecedores: sem CNPJ e sem nome", () => {
		expect(resolveFavorecido({ ...base, suppliers: new Set([CNPJ_A, CNPJ_B]), supplierName: "ARP" })).toEqual({ favorecidoCnpj14: null, favorecidoNome: null })
	})

	it("nenhum fornecedor com CNPJ: o nome da ARP ainda vale", () => {
		expect(resolveFavorecido({ ...base, supplierName: "ARP" })).toEqual({ favorecidoCnpj14: null, favorecidoNome: "ARP" })
		expect(resolveFavorecido(base)).toEqual({ favorecidoCnpj14: null, favorecidoNome: null })
	})

	it("CPF fica fora do CNPJ", () => {
		expect(resolveFavorecido({ ...base, informedCnpj: CPF, informedNome: "Pessoa" })).toEqual({ favorecidoCnpj14: null, favorecidoNome: "Pessoa" })
	})
})

describe("valores gravados", () => {
	it("resolveEmpenhoHeaderFields apara e anula vazios", () => {
		expect(
			resolveEmpenhoHeaderFields({
				dataEmpenho: "2026-03-10",
				tipo: "ordinario",
				nd: "339030",
				ptres: " 123 ",
				fonte: "  ",
				issuerUg: " 120001 ",
				notaLancamento: " 2026NL1 ",
			})
		).toEqual({ tipo: "ordinario", nd: "339030", ptres: "123", fonte: null, issuerUg: "120001", exercicio: 2026, notaLancamento: "2026NL1" })
		expect(resolveEmpenhoHeaderFields({ dataEmpenho: "2025-12-31" })).toEqual({
			tipo: null,
			nd: null,
			ptres: null,
			fonte: null,
			issuerUg: null,
			exercicio: 2025,
			notaLancamento: null,
		})
	})

	it("resolveEmpenhoItemFields herda descrição e unidade do item da ARP", () => {
		const arpItems = new Map<string, ArpItemFacts>([["a", toArpItemFacts(itemRow({ id: "a", descricao_item: "Arroz ARP" }), arpRow(), 0)]])
		const arpUnitByItem = new Map<string, string | null>([["a", "KG"]])
		expect(resolveEmpenhoItemFields({ arpItemId: "a", description: "  ", unit: " ", quantity: 2, unitPrice: 3, value: 0 }, arpItems, arpUnitByItem)).toEqual({
			arpItemId: "a",
			purchaseItemId: null,
			description: "Arroz ARP",
			quantity: 2,
			unit: "KG",
			unitPrice: 3,
			value: 6,
		})
		expect(
			resolveEmpenhoItemFields({ arpItemId: "a", purchaseItemId: "p", description: " Próprio ", unit: " UN ", value: 10 }, arpItems, arpUnitByItem)
		).toMatchObject({ purchaseItemId: "p", description: "Próprio", unit: "UN", quantity: null, unitPrice: null, value: 10 })
	})

	it("resolveEmpenhoItemFields sem item de ARP (ou item sem medida)", () => {
		expect(resolveEmpenhoItemFields({ value: 5 }, new Map(), new Map())).toEqual({
			arpItemId: null,
			purchaseItemId: null,
			description: null,
			quantity: null,
			unit: null,
			unitPrice: null,
			value: 5,
		})
		expect(resolveEmpenhoItemFields({ arpItemId: "x", value: 5 }, new Map(), new Map())).toMatchObject({ description: null, unit: null })
	})
})
