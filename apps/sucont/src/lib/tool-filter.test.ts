import { describe, expect, it } from "bun:test"
import { ALL_CATEGORIES } from "#/lib/hub-filters"
import { filterTools } from "#/lib/tool-filter"
import type { Tool } from "#/lib/types"

const tools: Tool[] = [
	{ id: "a", title: "Auditor", description: "Análise de dados", icon: "ShieldCheck", category: "Auditoria", internalPath: "/auditor" },
	{
		id: "b",
		title: "Chatbot SAU",
		description: "Assistente",
		icon: "MessageSquare",
		category: "IA / Chatbot",
		url: "https://notebooklm.google.com/notebook/x",
	},
	{ id: "c", title: "Ofícios", description: "Padronização de ofícios", icon: "FileText", category: "IA", url: "https://exemplo.test" },
]

describe("filterTools", () => {
	it("sem filtro devolve o catálogo inteiro", () => {
		expect(filterTools(tools, { query: "", category: ALL_CATEGORIES })).toHaveLength(3)
	})

	it("casa categoria por igualdade, não por conter", () => {
		// "IA" está contido em "IA / Chatbot": o filtro antigo trazia os dois cards.
		expect(filterTools(tools, { query: "", category: "IA" }).map((t) => t.id)).toEqual(["c"])
		expect(filterTools(tools, { query: "", category: "IA / Chatbot" }).map((t) => t.id)).toEqual(["b"])
	})

	it("busca em título, descrição e categoria, ignorando caixa e espaços em volta", () => {
		expect(filterTools(tools, { query: "  AUDITOR ", category: ALL_CATEGORIES }).map((t) => t.id)).toEqual(["a"])
		expect(filterTools(tools, { query: "assistente", category: ALL_CATEGORIES }).map((t) => t.id)).toEqual(["b"])
	})

	it("combina categoria e busca", () => {
		expect(filterTools(tools, { query: "ofícios", category: "IA / Chatbot" })).toHaveLength(0)
		expect(filterTools(tools, { query: "ofícios", category: "IA" }).map((t) => t.id)).toEqual(["c"])
	})
})
