import { describe, expect, test } from "bun:test"
import { meAccess } from "@/test/access-fixture"
import { accessibleModules, getModule, moduleScopeOptions, resolveNavItems, scopedPath } from "./modules"
import { buildScopeOptions } from "./scope"

describe("accessibleModules", () => {
	test("sem sessão: só o Pregoeiro", () => {
		expect(accessibleModules({ isAuthenticated: false, access: undefined }).map((m) => m.id)).toEqual(["pregoeiro"])
	})

	test("com sessão e sem papel: Requisitante e Pregoeiro", () => {
		expect(accessibleModules({ isAuthenticated: true, access: meAccess() }).map((m) => m.id)).toEqual(["requisitante", "pregoeiro"])
	})

	test("os quatro papéis globais: todos os módulos, na ordem do registro", () => {
		const access = meAccess({ requester: "all", procurement: "all", aci: "all", admin: "all" })
		expect(accessibleModules({ isAuthenticated: true, access }).map((m) => m.id)).toEqual(["aci", "requisitante", "pregoeiro", "alpha", "admin"])
	})

	// Acúmulo de papéis, sem segregação de funções (mantenedor, 2026-09-19): os quatro na MESMA
	// OM abrem todos os módulos de fluxo e o de acessos, cada um nessa OM. O Console α segue só
	// do ACI GLOBAL — curadoria é catálogo de todas as OMs, não papel de OM.
	test("os quatro papéis na mesma OM: todos os módulos da OM, cada um aberto nela", () => {
		const access = meAccess({ requester: [100], procurement: [100], aci: [100], admin: [100] })
		const modules = accessibleModules({ isAuthenticated: true, access })
		expect(modules.map((m) => m.id)).toEqual(["aci", "requisitante", "pregoeiro", "admin"])
		for (const id of ["aci", "requisitante", "admin"] as const) {
			expect(moduleScopeOptions(getModule(id), access).map((option) => option.id)).toContain("100")
		}
	})
})

describe("moduleScopeOptions", () => {
	test("a ACI cobre a união de licitações e ACI", () => {
		const options = moduleScopeOptions(getModule("aci"), meAccess({ procurement: [26], aci: [100] }))
		expect(options.map((option) => option.id)).toEqual(["26", "100"])
	})

	test("módulo sem escopo não tem opções", () => {
		expect(moduleScopeOptions(getModule("alpha"), meAccess({ aci: "all" }))).toEqual([])
	})
})

describe("scopedPath e resolveNavItems", () => {
	test("troca `$unitId` pelo escopo", () => {
		expect(scopedPath("/aci/$unitId/processos", "26")).toBe("/aci/26/processos")
	})

	test("dentro de uma OM, os itens levam a OM; no hub, os que dependem dela somem", () => {
		const requisitante = getModule("requisitante")
		const [scope] = buildScopeOptions([26], [{ id: 26, code: "GAP-SJ", display_name: null }])
		expect(resolveNavItems(requisitante, scope ?? null).map((item) => item.to)).toEqual(["/requisitante/26", "/requisitante/26/nova"])
		expect(resolveNavItems(requisitante, null)).toEqual([])
		expect(resolveNavItems(getModule("alpha"), null).map((item) => item.to)).toEqual(["/alpha/fontes", "/alpha/bancada"])
	})
})
