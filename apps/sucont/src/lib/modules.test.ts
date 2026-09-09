import { describe, expect, it } from "bun:test"
import type { UserPermission } from "@iefa/pbac"
import { sucontTools } from "#/lib/data"
import { accessibleModules, DEFAULT_DIVISION, findModuleByPath, isDivision, SUCONT_MODULES, toolBelongsTo, toolsForDivision } from "#/lib/modules"
import type { Tool } from "#/lib/types"

const grant = (level: number): UserPermission[] => [{ module: "sucont", level, mess_hall_id: null, kitchen_id: null, unit_id: null }]

const tool = (id: string, divisions?: Tool["divisions"]): Tool => ({ id, title: id, description: "", icon: "Search", stage: "analisar", divisions })

describe("findModuleByPath", () => {
	it("a rota própria do admin vence qualquer divisão na URL", () => {
		// O `?divisao=` não pode arrastar a barra da SUCONT-3 para dentro da tela de
		// permissões: `/admin` é o único módulo com prefixo exclusivo.
		expect(findModuleByPath("/admin", "sucont-3").id).toBe("admin")
		expect(findModuleByPath("/admin/permissoes", "sucont-3").id).toBe("admin")
	})

	it("prefixo solto NÃO entra no admin", () => {
		expect(findModuleByPath("/administrativo").id).not.toBe("admin")
		expect(findModuleByPath("/adminx/y").id).not.toBe("admin")
	})

	it("dentro de uma ferramenta, a divisão DELA manda — mesmo sem parâmetro", () => {
		// É o caso do link direto: abrir /conta-generica com o padrão SUCONT-4
		// mostraria uma barra lateral que não contém a tela aberta.
		expect(findModuleByPath("/conta-generica").id).toBe("sucont-3")
		expect(findModuleByPath("/sac-dgc").id).toBe("sucont-1")
		expect(findModuleByPath("/auditor").id).toBe("sucont-4")
	})

	it("a divisão da URL desempata ferramenta que serve a duas", () => {
		// O Monitoramento é da SUCONT-3 e da SUCONT-4.
		expect(findModuleByPath("/monitoramento", "sucont-4").id).toBe("sucont-4")
		expect(findModuleByPath("/monitoramento", "sucont-3").id).toBe("sucont-3")
	})

	it("a URL não consegue mentir sobre a divisão de uma ferramenta", () => {
		// `?divisao=sucont-1` numa ferramenta que não é da 1 cai na divisão real dela,
		// senão a barra prometeria um módulo que não contém a tela.
		expect(findModuleByPath("/conta-generica", "sucont-1").id).toBe("sucont-3")
	})

	it("fora de ferramenta, manda a URL", () => {
		for (const path of ["/", "/workspace", "/reports"]) {
			expect(findModuleByPath(path, "sucont-3").id).toBe("sucont-3")
			expect(findModuleByPath(path, "sucont-1").id).toBe("sucont-1")
		}
	})

	it("sem divisão na URL, e sem ferramenta, vale o padrão", () => {
		// Preserva o que um link antigo — de quando o app inteiro era "SUCONT-4 HUB" —
		// sempre mostrou.
		expect(findModuleByPath("/").division).toBe(DEFAULT_DIVISION)
		expect(findModuleByPath("/", "divisao-inventada").division).toBe(DEFAULT_DIVISION)
		expect(findModuleByPath("/", 42).division).toBe(DEFAULT_DIVISION)
	})
})

describe("isDivision", () => {
	it("aceita só as divisões declaradas", () => {
		expect(isDivision("sucont-3")).toBe(true)
		expect(isDivision("sucont-2")).toBe(false)
		expect(isDivision("admin")).toBe(false)
		expect(isDivision(3)).toBe(false)
		expect(isDivision(undefined)).toBe(false)
	})
})

describe("toolBelongsTo", () => {
	it("ferramenta sem divisão pertence a todas", () => {
		// Sistema federal e caderno sem dono não somem do catálogo de ninguém.
		const geral = tool("siafi-web")
		expect(toolBelongsTo(geral, "sucont-1")).toBe(true)
		expect(toolBelongsTo(geral, "sucont-3")).toBe(true)
		expect(toolBelongsTo(geral, "sucont-4")).toBe(true)
	})

	it("ferramenta com divisão pertence só às suas", () => {
		const t = tool("x", ["sucont-3", "sucont-4"])
		expect(toolBelongsTo(t, "sucont-3")).toBe(true)
		expect(toolBelongsTo(t, "sucont-4")).toBe(true)
		expect(toolBelongsTo(t, "sucont-1")).toBe(false)
	})
})

describe("toolsForDivision, sobre o catálogo real", () => {
	it("nenhuma divisão fica vazia", () => {
		// Módulo vazio no seletor é promessa que a tela não cumpre.
		for (const division of ["sucont-1", "sucont-3", "sucont-4"] as const) {
			expect(toolsForDivision(sucontTools, division).length).toBeGreaterThan(0)
		}
	})

	it("o DGC é a única ferramenta exclusiva da SUCONT-1", () => {
		const exclusivas = sucontTools.filter((t) => t.divisions?.length === 1 && t.divisions[0] === "sucont-1")
		expect(exclusivas.map((t) => t.id)).toEqual(["sac-dgc"])
	})

	it("as trilhas do RAC são da SUCONT-3", () => {
		// São as que assinam "SUCONT-3" na mensagem que vai para a UG.
		for (const id of ["cruzamento-contas", "conta-generica", "subitens-genericos", "analista-compatibilidade", "analistasaldoalongado"]) {
			expect(sucontTools.find((t) => t.id === id)?.divisions).toEqual(["sucont-3"])
		}
	})

	it("o Monitoramento aparece nas duas divisões que atende", () => {
		expect(toolsForDivision(sucontTools, "sucont-3").some((t) => t.id === "monitoramento")).toBe(true)
		expect(toolsForDivision(sucontTools, "sucont-4").some((t) => t.id === "monitoramento")).toBe(true)
	})

	it("toda ferramenta declarada aponta para uma divisão que existe", () => {
		const known = new Set(SUCONT_MODULES.map((m) => m.division).filter(Boolean))
		for (const t of sucontTools) {
			for (const d of t.divisions ?? []) expect(known.has(d)).toBe(true)
		}
	})
})

describe("accessibleModules", () => {
	it("nível 1 e 2 alcançam as três divisões, mas não a Administração", () => {
		for (const level of [1, 2]) {
			expect(accessibleModules(grant(level)).map((m) => m.id)).toEqual(["sucont-4", "sucont-3", "sucont-1"])
		}
	})

	it("nível 3 alcança tudo", () => {
		expect(accessibleModules(grant(3)).map((m) => m.id)).toEqual(["sucont-4", "sucont-3", "sucont-1", "admin"])
	})

	it("sem grant nenhum, nada é alcançável", () => {
		// A raiz já redireciona quem não tem nível 1; o seletor não pode contradizê-la
		// enquanto as permissões ainda não chegaram.
		expect(accessibleModules([])).toEqual([])
	})
})

describe("SUCONT_MODULES", () => {
	it("uma divisão tem no máximo um módulo", () => {
		const divisions = SUCONT_MODULES.map((m) => m.division).filter(Boolean)
		expect(new Set(divisions).size).toBe(divisions.length)
	})

	it("só o admin tem prefixo de rota exclusivo", () => {
		// As divisões compartilham as rotas — é por isso que a divisão ativa precisa
		// vir da URL, e não do caminho.
		expect(SUCONT_MODULES.filter((m) => m.basePath !== null).map((m) => m.id)).toEqual(["admin"])
	})

	it("a rota de entrada de cada módulo pertence a ele", () => {
		for (const module of SUCONT_MODULES) {
			expect(findModuleByPath(module.home, module.division).id).toBe(module.id)
		}
	})
})
