import { describe, expect, it } from "vitest"
import { type CanOpen, indexEntries, type PaletteEntry, parseRecentScopes, resolveEntryTarget, searchEntries } from "@/lib/command-palette"

const storage = { moduleId: "storage", moduleName: "Estoque", hubUrl: "/storage", scopeType: "kitchen" } as const

const ENTRIES: PaletteEntry[] = [
	{ id: "/diner/forecast", label: "Previsão", moduleId: "diner", moduleName: "Comensal", url: "/diner/forecast" },
	{ ...storage, id: "/storage/receiving", label: "Recebimentos", group: "Entrada", url: "/storage/receiving" },
	{ ...storage, id: "/storage/counts", label: "Contagem Física", group: "Controle", keywords: ["inventário"], url: "/storage/counts", minLevel: 3 },
	{ ...storage, id: "/storage/nfe", label: "Notas Fiscais (NF-e)", group: "Entrada", url: "/storage/nfe" },
	{ id: "/unit/empenhos", label: "Empenhos", moduleId: "unit", moduleName: "Gestão Unidade", url: "/unit/empenhos", hubUrl: "/unit", scopeType: "unit" },
	{ id: "/messhall/", label: "Presenças", moduleId: "messhall", moduleName: "Fiscal", url: "/messhall/", hubUrl: "/messhall", scopeType: "mess_hall" },
]
const INDEX = indexEntries(ENTRIES)
const byLabel = (label: string) => ENTRIES.find((e) => e.label === label) as PaletteEntry
const labels = (entries: PaletteEntry[]) => entries.map((e) => e.label)
const openAll: CanOpen = () => true

describe("searchEntries", () => {
	it("busca vazia devolve o índice na ordem", () => {
		expect(labels(searchEntries(INDEX, "  "))).toEqual(labels(ENTRIES))
	})

	it("casa sem acento", () => {
		expect(labels(searchEntries(INDEX, "previsao"))).toEqual(["Previsão"])
	})

	it("acha pela palavra-chave", () => {
		expect(labels(searchEntries(INDEX, "inventario"))).toEqual(["Contagem Física"])
	})

	it("exige todos os termos, em qualquer campo", () => {
		expect(labels(searchEntries(INDEX, "estoque nf"))).toEqual(["Notas Fiscais (NF-e)"])
	})

	it("rótulo pesa mais que módulo", () => {
		expect(searchEntries(INDEX, "emp")[0]?.label).toBe("Empenhos")
		expect(labels(searchEntries(INDEX, "estoque"))).toEqual(["Recebimentos", "Contagem Física", "Notas Fiscais (NF-e)"])
	})

	it("não quebra com caractere de regex", () => {
		expect(labels(searchEntries(INDEX, "(nf-e)"))).toEqual(["Notas Fiscais (NF-e)"])
	})
})

describe("resolveEntryTarget", () => {
	const receiving = byLabel("Recebimentos")

	it("módulo sem escopo abre direto", () => {
		expect(resolveEntryTarget(byLabel("Previsão"), null, {}, openAll)).toEqual({ kind: "page", to: "/diner/forecast" })
	})

	it("usa o escopo aberto quando é do mesmo tipo", () => {
		// cozinha 7 na Gestão Cozinha → Estoque da cozinha 7
		expect(resolveEntryTarget(receiving, { scopeType: "kitchen", id: 7, name: "GAP-AF" }, {}, openAll)).toEqual({
			kind: "page",
			to: "/storage/7/receiving",
			scopeName: "GAP-AF",
		})
	})

	it("não usa escopo de outro tipo", () => {
		const target = resolveEntryTarget(receiving, { scopeType: "unit", id: 14, name: "AFA" }, { kitchen: { id: 3, name: "DIRAD" } }, openAll)
		expect(target).toEqual({ kind: "page", to: "/storage/3/receiving", scopeName: "DIRAD" })
	})

	it("não empresta escopo em que o usuário não abre o módulo", () => {
		// Gestão na cozinha 7, Estoque só na cozinha 3: ir para /storage/7 daria "Acesso negado"
		const canOpen: CanOpen = (moduleId, _level, scope) => moduleId !== "storage" || scope.id === 3
		const current = { scopeType: "kitchen" as const, id: 7, name: "GAP-AF" }
		expect(resolveEntryTarget(receiving, current, {}, canOpen)).toEqual({ kind: "hub", to: "/storage" })
		expect(resolveEntryTarget(receiving, current, { kitchen: { id: 3, name: "DIRAD" } }, canOpen)).toEqual({
			kind: "page",
			to: "/storage/3/receiving",
			scopeName: "DIRAD",
		})
	})

	it("confere o nível da página no escopo", () => {
		const levels: number[] = []
		resolveEntryTarget(byLabel("Contagem Física"), { scopeType: "kitchen", id: 7, name: "GAP-AF" }, {}, (_m, level) => {
			levels.push(level)
			return false
		})
		expect(levels).toEqual([3])
	})

	it("sem escopo conhecido abre o hub do módulo", () => {
		expect(resolveEntryTarget(receiving, null, {}, openAll)).toEqual({ kind: "hub", to: "/storage" })
	})

	it("item da rota index do escopo vira a raiz do escopo", () => {
		expect(resolveEntryTarget(byLabel("Presenças"), null, { mess_hall: { id: 32, name: "AFA" } }, openAll)).toEqual({
			kind: "page",
			to: "/messhall/32/",
			scopeName: "AFA",
		})
	})
})

describe("parseRecentScopes", () => {
	it("aceita o formato gravado", () => {
		expect(parseRecentScopes('{"kitchen":{"id":7,"name":"GAP-AF"}}')).toEqual({ kitchen: { id: 7, name: "GAP-AF" } })
	})

	it.each(["null", "[]", "42", "{", '{"kitchen":{"id":"7"}}', '{"outro":{"id":1,"name":"x"}}'])("descarta %s", (raw) => {
		expect(parseRecentScopes(raw)).toEqual({})
	})

	it("trata ausência como vazio", () => {
		expect(parseRecentScopes(null)).toEqual({})
	})
})
