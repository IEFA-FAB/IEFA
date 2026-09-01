import { describe, expect, it } from "bun:test"
import { buildToolCrumbs, buildToolNav, findToolByPath, toolScopeLabel } from "#/lib/tool-nav"
import type { Tool } from "#/lib/types"

const tools: Tool[] = [
	{ id: "auditor", title: "Auditor", description: "", icon: "ShieldCheck", stage: "analisar", internalPath: "/auditor" },
	{ id: "conta", title: "Conta Genérica (Q35)", description: "", icon: "Search", stage: "analisar", internalPath: "/conta-generica", racQuestions: [35] },
	{ id: "mon", title: "Monitoramento", description: "", icon: "Activity", stage: "acompanhar", internalPath: "/monitoramento" },
	{ id: "externa", title: "Siafi Web", description: "", icon: "ExternalLink", stage: "consultar", url: "https://exemplo.test" },
]

describe("buildToolNav", () => {
	it("agrupa por etapa e omite etapa vazia", () => {
		const nav = buildToolNav(tools)
		expect(nav.map((g) => g.id)).toEqual(["analisar", "acompanhar"])
		expect(nav[0]?.tools.map((t) => t.id)).toEqual(["auditor", "conta"])
	})

	it("ferramenta externa NÃO entra na barra", () => {
		// Ela tira o usuário do app; ao lado das telas do hub prometeria o contrário.
		expect(
			buildToolNav(tools)
				.flatMap((g) => g.tools)
				.some((t) => t.id === "externa")
		).toBe(false)
	})
})

describe("findToolByPath", () => {
	it("casa a rota exata", () => {
		expect(findToolByPath(tools, "/conta-generica")?.id).toBe("conta")
	})

	it("casa rota filha", () => {
		expect(findToolByPath(tools, "/auditor/relatorio")?.id).toBe("auditor")
	})

	it("ignora barra final", () => {
		expect(findToolByPath(tools, "/auditor/")?.id).toBe("auditor")
	})

	it("NÃO casa por prefixo solto", () => {
		// `startsWith` cru faria esta rota, que é de outra ferramenta, virar Conta Genérica.
		expect(findToolByPath(tools, "/conta-generica-x")).toBeNull()
	})

	it("caminho sem ferramenta devolve null", () => {
		expect(findToolByPath(tools, "/reports")).toBeNull()
		expect(findToolByPath(tools, "/")).toBeNull()
	})
})

describe("buildToolCrumbs", () => {
	it("sem ferramenta não há trilha", () => {
		expect(buildToolCrumbs(null)).toEqual([])
	})

	it("trilha vai do catálogo à ferramenta, com a etapa filtrando o catálogo", () => {
		const crumbs = buildToolCrumbs(tools[1] as Tool)
		expect(crumbs.map((c) => c.label)).toEqual(["Catálogo", "Analisar", "Conta Genérica (Q35)"])
		expect(crumbs[1]?.search).toEqual({ etapa: "analisar" })
	})

	it("o último item não é link", () => {
		const crumbs = buildToolCrumbs(tools[1] as Tool)
		expect(crumbs[crumbs.length - 1]?.to).toBeUndefined()
	})
})

describe("toolScopeLabel", () => {
	it("devolve as questões da ferramenta", () => {
		expect(toolScopeLabel(tools[1] as Tool)).toBe("Q35")
	})

	it("ferramenta sem questão não inventa escopo", () => {
		expect(toolScopeLabel(tools[0] as Tool)).toBeNull()
		expect(toolScopeLabel(null)).toBeNull()
	})
})
