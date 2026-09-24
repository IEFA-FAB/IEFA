import { describe, expect, it } from "vitest"
import { normalize, type PaletteEntry, resolveEntryTarget, searchEntries } from "@/lib/command-palette"

const ENTRIES: PaletteEntry[] = [
	{ id: "/diner/forecast", label: "Previsão", moduleId: "diner", moduleName: "Comensal", url: "/diner/forecast" },
	{
		id: "/storage/receiving",
		label: "Recebimentos",
		moduleId: "storage",
		moduleName: "Estoque",
		group: "Entrada",
		url: "/storage/receiving",
		hubUrl: "/storage",
	},
	{
		id: "/storage/counts",
		label: "Contagem Física",
		moduleId: "storage",
		moduleName: "Estoque",
		group: "Controle",
		keywords: ["inventário"],
		url: "/storage/counts",
		hubUrl: "/storage",
	},
	{ id: "/storage/nfe", label: "Notas Fiscais (NF-e)", moduleId: "storage", moduleName: "Estoque", group: "Entrada", url: "/storage/nfe", hubUrl: "/storage" },
	{ id: "/unit/empenhos", label: "Empenhos", moduleId: "unit", moduleName: "Gestão Unidade", url: "/unit/empenhos", hubUrl: "/unit" },
	{ id: "/messhall/", label: "Presenças", moduleId: "messhall", moduleName: "Fiscal", url: "/messhall/", hubUrl: "/messhall" },
]

const labels = (entries: PaletteEntry[]) => entries.map((e) => e.label)

describe("normalize", () => {
	it("ignora acento e caixa", () => {
		expect(normalize("  Previsão ")).toBe("previsao")
	})
})

describe("searchEntries", () => {
	it("busca vazia devolve o índice na ordem", () => {
		expect(labels(searchEntries(ENTRIES, "  "))).toEqual(labels(ENTRIES))
	})

	it("casa sem acento", () => {
		expect(labels(searchEntries(ENTRIES, "previsao"))).toEqual(["Previsão"])
	})

	it("acha pela palavra-chave", () => {
		expect(labels(searchEntries(ENTRIES, "inventario"))).toEqual(["Contagem Física"])
	})

	it("exige todos os termos, em qualquer campo", () => {
		expect(labels(searchEntries(ENTRIES, "estoque nf"))).toEqual(["Notas Fiscais (NF-e)"])
	})

	it("rótulo pesa mais que módulo", () => {
		// "e" começa "Empenhos" e "Estoque": a página cujo NOME começa com o termo vem antes
		expect(searchEntries(ENTRIES, "emp")[0]?.label).toBe("Empenhos")
		expect(labels(searchEntries(ENTRIES, "estoque"))).toEqual(["Recebimentos", "Contagem Física", "Notas Fiscais (NF-e)"])
	})

	it("não quebra com caractere de regex", () => {
		expect(labels(searchEntries(ENTRIES, "(nf-e)"))).toEqual(["Notas Fiscais (NF-e)"])
	})
})

describe("resolveEntryTarget", () => {
	const receiving = ENTRIES[1] as PaletteEntry

	it("módulo sem escopo abre direto", () => {
		expect(resolveEntryTarget(ENTRIES[0] as PaletteEntry, null, {})).toEqual({ kind: "page", to: "/diner/forecast" })
	})

	it("usa o escopo aberto quando é da mesma família", () => {
		// cozinha 7 na Gestão Cozinha → Estoque da cozinha 7
		expect(resolveEntryTarget(receiving, { moduleId: "kitchen", scopeId: 7, scopeName: "GAP-AF" }, {})).toEqual({
			kind: "page",
			to: "/storage/7/receiving",
			scopeName: "GAP-AF",
		})
	})

	it("não usa escopo de outra família", () => {
		// unidade 14 não é cozinha: cai no último escopo de cozinha
		const target = resolveEntryTarget(receiving, { moduleId: "unit", scopeId: 14, scopeName: "AFA" }, { kitchen: { id: 3, name: "DIRAD" } })
		expect(target).toEqual({ kind: "page", to: "/storage/3/receiving", scopeName: "DIRAD" })
	})

	it("sem escopo conhecido abre o hub do módulo", () => {
		expect(resolveEntryTarget(receiving, null, {})).toEqual({ kind: "hub", to: "/storage" })
	})

	it("item da rota index do escopo vira a raiz do escopo", () => {
		expect(resolveEntryTarget(ENTRIES[5] as PaletteEntry, null, { messhall: { id: 32, name: "AFA" } })).toEqual({
			kind: "page",
			to: "/messhall/32/",
			scopeName: "AFA",
		})
	})
})
