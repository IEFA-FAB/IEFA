import { describe, expect, it } from "bun:test"
import type { AppModule, UserPermission } from "@iefa/pbac"
import { sucontTools } from "#/lib/data"
import {
	accessibleModules,
	DEFAULT_DIVISION,
	defaultDivisionFor,
	findModuleByPath,
	isDivision,
	permissionModulesForPath,
	permissionModulesForTool,
	resolveDivision,
	SUCONT_MODULES,
	toolBelongsTo,
	toolsForDivision,
} from "#/lib/modules"
import { canAccessHub, SUCONT_DIVISION_MODULES } from "#/lib/permission-modules"
import type { Tool } from "#/lib/types"

/** Grants inline, unscoped — o único formato que o sucont usa. */
const grants = (...pairs: Array<[AppModule, number]>): UserPermission[] =>
	pairs.map(([module, level]) => ({ module, level, mess_hall_id: null, kitchen_id: null, unit_id: null }))

/** Acesso a TODAS as divisões, no mesmo nível — o que o backfill do split concedeu. */
const allDivisions = (level: number): UserPermission[] => grants(...SUCONT_DIVISION_MODULES.map((m) => [m, level] as [AppModule, number]))

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
	it("as três divisões juntas não abrem a Administração", () => {
		// É o ponto do split: acesso a ferramenta e administração de acessos são grants
		// separados. Antes, um único `sucont` nível 3 dava os dois.
		for (const level of [1, 2]) {
			expect(accessibleModules(allDivisions(level)).map((m) => m.id)).toEqual(["sucont-4", "sucont-3", "sucont-1"])
		}
	})

	it("cada divisão aparece SOZINHA — ter uma não traz as outras", () => {
		expect(accessibleModules(grants(["sucont-3", 1])).map((m) => m.id)).toEqual(["sucont-3"])
		expect(accessibleModules(grants(["sucont-1", 2])).map((m) => m.id)).toEqual(["sucont-1"])
	})

	it("`sucont-admin` abre a Administração e mais nada", () => {
		// Quem só governa acessos não abre ferramenta nenhuma; o hub fica fechado para ele.
		expect(accessibleModules(grants(["sucont-admin", 3])).map((m) => m.id)).toEqual(["admin"])
	})

	it("a Administração exige nível 3, não basta ter o módulo", () => {
		expect(accessibleModules(grants(["sucont-admin", 2])).map((m) => m.id)).toEqual([])
	})

	it("sem grant nenhum, nada é alcançável", () => {
		// A raiz já redireciona quem não tem nível 1; o seletor não pode contradizê-la
		// enquanto as permissões ainda não chegaram.
		expect(accessibleModules([])).toEqual([])
	})

	it("deny de uma divisão não derruba as outras", () => {
		// Negar a SUCONT-4 não é negar o app: a precedência de deny é por módulo.
		const permissions = [...allDivisions(1), ...grants(["sucont-4", 0])]
		expect(accessibleModules(permissions).map((m) => m.id)).toEqual(["sucont-3", "sucont-1"])
	})
})

describe("canAccessHub", () => {
	it("basta uma divisão", () => {
		expect(canAccessHub(grants(["sucont-1", 1]))).toBe(true)
	})

	it("só `sucont-admin` NÃO abre o hub", () => {
		// O hub é o catálogo de ferramentas; administrar acessos não é abrir ferramenta.
		expect(canAccessHub(grants(["sucont-admin", 3]))).toBe(false)
	})

	it("sem grant, não abre", () => {
		expect(canAccessHub([])).toBe(false)
	})
})

describe("defaultDivisionFor", () => {
	it("com a SUCONT-4, vale o padrão histórico", () => {
		expect(defaultDivisionFor(allDivisions(1))).toBe(DEFAULT_DIVISION)
	})

	it("sem a SUCONT-4, cai na primeira divisão ACESSÍVEL", () => {
		// Senão quem só trabalha na SUCONT-3 abriria o hub num catálogo que ele não
		// pode usar, com a barra lateral de outra divisão.
		expect(defaultDivisionFor(grants(["sucont-3", 1]))).toBe("sucont-3")
		expect(defaultDivisionFor(grants(["sucont-1", 1]))).toBe("sucont-1")
	})

	it("sem divisão nenhuma, devolve o padrão — quem barra é o guard", () => {
		expect(defaultDivisionFor(grants(["sucont-admin", 3]))).toBe(DEFAULT_DIVISION)
	})
})

describe("resolveDivision", () => {
	it("respeita o `?divisao=` quando o usuário alcança a divisão", () => {
		expect(resolveDivision(allDivisions(1), "sucont-3")).toBe("sucont-3")
	})

	it("IGNORA o `?divisao=` de uma divisão que o usuário não tem", () => {
		// A forma do parâmetro é validada no `validateSearch` da raiz, e isso não é
		// autorização: sem esta degradação, `/?divisao=sucont-3` numa conta só da
		// SUCONT-4 abria um catálogo vazio com a barra de uma divisão que o seletor
		// nem lista.
		expect(resolveDivision(grants(["sucont-4", 1]), "sucont-3")).toBe("sucont-4")
		expect(resolveDivision(grants(["sucont-1", 1]), "sucont-4")).toBe("sucont-1")
	})

	it("um deny escopado na divisão pedida também degrada", () => {
		const permissions = [...allDivisions(1), ...grants(["sucont-4", 0])]
		expect(resolveDivision(permissions, "sucont-4")).toBe("sucont-3")
	})

	it("valor inválido ou ausente cai no padrão acessível", () => {
		expect(resolveDivision(grants(["sucont-3", 1]), undefined)).toBe("sucont-3")
		expect(resolveDivision(grants(["sucont-3", 1]), "divisao-inventada")).toBe("sucont-3")
		expect(resolveDivision(grants(["sucont-3", 1]), 42)).toBe("sucont-3")
	})
})

describe("permissionModulesForTool / permissionModulesForPath", () => {
	it("ferramenta sem divisão vale para as três", () => {
		expect(permissionModulesForTool(tool("siafi-web"))).toEqual(SUCONT_DIVISION_MODULES)
	})

	it("ferramenta de duas divisões aceita qualquer uma delas", () => {
		expect(permissionModulesForTool(tool("x", ["sucont-3", "sucont-4"]))).toEqual(["sucont-3", "sucont-4"])
	})

	it("a rota de cada ferramenta do catálogo real cobra a divisão DELA", () => {
		// É o contrato de que o guard de rota e o catálogo não podem divergir: se a
		// ferramenta some do catálogo de uma divisão, ela também deixa de abrir por URL.
		expect(permissionModulesForPath("/auditor")).toEqual(["sucont-4"])
		expect(permissionModulesForPath("/conta-generica")).toEqual(["sucont-3"])
		expect(permissionModulesForPath("/sac-dgc")).toEqual(["sucont-1"])
		expect(permissionModulesForPath("/monitoramento")).toEqual(["sucont-3", "sucont-4"])
	})

	it("caminho que não é de ferramenta vale para as três", () => {
		// Catálogo, área de trabalho e relatórios são telas da seção inteira.
		for (const path of ["/", "/workspace", "/reports"]) {
			expect(permissionModulesForPath(path)).toEqual(SUCONT_DIVISION_MODULES)
		}
	})

	it("TODA rota interna do catálogo tem guard derivável", () => {
		// Varredura: nenhuma ferramenta de rota interna pode cair no caso "as três"
		// por acidente — se ela declara divisão, o guard tem que cobrar exatamente ela.
		for (const t of sucontTools) {
			if (!t.internalPath || !t.divisions) continue
			expect(permissionModulesForPath(t.internalPath)).toEqual(t.divisions.map((d) => d as AppModule))
		}
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

	it("cada módulo aponta para um módulo do PBAC distinto", () => {
		// Dois módulos do hub sob o mesmo grant seria o modelo antigo de volta: conceder
		// um concederia o outro sem que a tela dissesse.
		const modules = SUCONT_MODULES.map((m) => m.permissionModule)
		expect(new Set(modules).size).toBe(modules.length)
	})
})
