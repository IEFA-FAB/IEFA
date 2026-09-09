import { describe, expect, it } from "bun:test"
import type { UserPermission } from "@iefa/pbac"
import { accessibleModules, findModuleByPath, SUCONT_MODULES } from "#/lib/modules"

const grant = (level: number): UserPermission[] => [{ module: "sucont", level, mess_hall_id: null, kitchen_id: null, unit_id: null }]

describe("findModuleByPath", () => {
	it("reconhece as rotas do módulo admin", () => {
		expect(findModuleByPath("/admin").id).toBe("admin")
		expect(findModuleByPath("/admin/").id).toBe("admin")
		expect(findModuleByPath("/admin/permissoes").id).toBe("admin")
	})

	it("prefixo solto NÃO entra no módulo", () => {
		// `startsWith` cru faria a rota de outra ferramenta cair na Administração — e a
		// barra lateral inteira trocaria de conteúdo no meio do hub.
		expect(findModuleByPath("/administrativo").id).toBe("hub")
		expect(findModuleByPath("/adminx/y").id).toBe("hub")
	})

	it("o resto do app é o hub", () => {
		for (const path of ["/", "/workspace", "/reports", "/auditor", "/sac-dgc"]) {
			expect(findModuleByPath(path).id).toBe("hub")
		}
	})
})

describe("accessibleModules", () => {
	it("nível 1 e 2 não alcançam a Administração", () => {
		expect(accessibleModules(grant(1)).map((m) => m.id)).toEqual(["hub"])
		expect(accessibleModules(grant(2)).map((m) => m.id)).toEqual(["hub"])
	})

	it("nível 3 alcança os dois", () => {
		expect(accessibleModules(grant(3)).map((m) => m.id)).toEqual(["hub", "admin"])
	})

	it("sem grant nenhum, nada é alcançável", () => {
		// A raiz já redireciona quem não tem nível 1; o seletor não pode contradizê-la
		// oferecendo um módulo enquanto as permissões ainda não chegaram.
		expect(accessibleModules([])).toEqual([])
	})
})

describe("SUCONT_MODULES", () => {
	it("o módulo padrão é o último a reivindicar caminho", () => {
		// `findModuleByPath` devolve o padrão quando ninguém casa; um segundo módulo
		// sem `basePath` viraria código inalcançável.
		expect(SUCONT_MODULES.filter((m) => m.basePath === null)).toHaveLength(1)
	})

	it("a rota de entrada pertence ao próprio módulo", () => {
		for (const module of SUCONT_MODULES) {
			expect(findModuleByPath(module.home).id).toBe(module.id)
		}
	})
})
