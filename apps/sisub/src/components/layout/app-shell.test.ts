import { describe, expect, test } from "vitest"
import type { ModuleDef } from "@/components/layout/sidebar/NavItems"
import type { NavCrumb } from "@/lib/breadcrumbs"
import {
	applyScopeToModules,
	buildDocumentTitle,
	buildSidebarScope,
	findParentCrumb,
	resolveActiveEntityLabel,
	resolveEffectiveModuleId,
	resolveScopeContext,
} from "./app-shell"

const SCOPE = { id: 7, name: "GAP-AF" }

function mod(patch: Partial<ModuleDef> & Pick<ModuleDef, "id">): ModuleDef {
	return { name: patch.id, icon: (() => null) as never, color: "primary", items: [], ...patch } as ModuleDef
}

const STORAGE = mod({
	id: "storage",
	hubUrl: "/storage",
	scopeNoun: "cozinha",
	scopeType: "kitchen" as never,
	items: [{ title: "Recebimento", url: "/storage/receiving", icon: (() => null) as never }],
})
const ADMIN = mod({ id: "admin", items: [{ title: "Usuários", url: "/admin/users", icon: (() => null) as never }] })

function crumb(key: string, to: string | null, label = key): NavCrumb {
	return { key, to, label }
}

describe("resolveScopeContext", () => {
	test("primeiro match com escopo, se o id estiver na posição de escopo", () => {
		const matches = [{ context: {} }, { context: { scopeContext: SCOPE } }, { context: { scopeContext: { id: 9, name: "x" } } }]
		expect(resolveScopeContext(matches, "/storage/7/receiving")).toBe(SCOPE)
	})
	test("escopo de outra página não vaza", () => {
		expect(resolveScopeContext([{ context: { scopeContext: SCOPE } }], "/unit/3/x")).toBeUndefined()
	})
	test("sem escopo nos matches (context ausente incluído)", () => {
		expect(resolveScopeContext([{ context: undefined }, { context: {} }], "/storage/7")).toBeUndefined()
	})
})

describe("resolveEffectiveModuleId", () => {
	test("caminho > escolhido > primeiro disponível > nulo", () => {
		expect(resolveEffectiveModuleId("storage", "admin", [ADMIN])).toBe("storage")
		expect(resolveEffectiveModuleId(null, "admin", [STORAGE])).toBe("admin")
		expect(resolveEffectiveModuleId(null, null, [STORAGE, ADMIN])).toBe("storage")
		expect(resolveEffectiveModuleId(null, null, [])).toBeNull()
	})
})

describe("applyScopeToModules", () => {
	test("módulo inativo fica intacto; o ativo recebe o escopo mesmo sem hub", () => {
		const out = applyScopeToModules([STORAGE, ADMIN], "admin", SCOPE)
		expect(out[0]).toBe(STORAGE)
		expect(out[1]?.items.map((i) => i.url)).toEqual(["/admin/7/users"])
	})
	test("módulo com hub sem escopo: sem itens", () => {
		expect(applyScopeToModules([STORAGE], "storage", undefined)[0]?.items).toEqual([])
	})
	test("módulo sem hub e sem escopo: intacto", () => {
		expect(applyScopeToModules([ADMIN], "admin", undefined)[0]).toBe(ADMIN)
	})
	test("com escopo: id entra na URL dos itens", () => {
		expect(applyScopeToModules([STORAGE], "storage", SCOPE)[0]?.items.map((i) => i.url)).toEqual(["/storage/7/receiving"])
	})
})

describe("buildSidebarScope", () => {
	test("só com escopo e hub", () => {
		expect(buildSidebarScope(SCOPE, STORAGE)).toEqual({ name: "GAP-AF", hubUrl: "/storage", noun: "cozinha" })
		expect(buildSidebarScope(undefined, STORAGE)).toBeNull()
		expect(buildSidebarScope(SCOPE, ADMIN)).toBeNull()
		expect(buildSidebarScope(SCOPE, undefined)).toBeNull()
	})
	test("sem scopeNoun vira 'escopo'", () => {
		expect(buildSidebarScope(SCOPE, { ...STORAGE, scopeNoun: undefined } as unknown as ModuleDef)?.noun).toBe("escopo")
	})
})

describe("resolveActiveEntityLabel", () => {
	test("vale só para a página atual (barra final ignorada)", () => {
		expect(resolveActiveEntityLabel({ path: "/a/1", label: "Arroz" }, "/a/1/")).toBe("Arroz")
		expect(resolveActiveEntityLabel({ path: "/a/1", label: "Arroz" }, "/a/2")).toBeNull()
		expect(resolveActiveEntityLabel(null, "/a/1")).toBeNull()
	})
})

describe("buildDocumentTitle", () => {
	test("sem crumbs: Início", () => {
		expect(buildDocumentTitle([], null, undefined)).toBe("Início — SISUB")
	})
	test("label vazio também cai em Início", () => {
		expect(buildDocumentTitle([crumb("a", null, "")], null, undefined)).toBe("Início — SISUB")
	})
	test("página · registro · escopo", () => {
		expect(buildDocumentTitle([crumb("a", "/a", "Estoque"), crumb("b", null, "Imprimir")], "Arroz", SCOPE)).toBe("Imprimir · Arroz · GAP-AF — SISUB")
	})
	test("registro igual à página e escopo igual à página não repetem", () => {
		expect(buildDocumentTitle([crumb("b", null, "Arroz")], "Arroz", undefined)).toBe("Arroz — SISUB")
		expect(buildDocumentTitle([crumb("b", null, "GAP-AF")], null, SCOPE)).toBe("GAP-AF — SISUB")
	})
})

describe("findParentCrumb", () => {
	test("o navegável mais próximo acima da página atual", () => {
		expect(findParentCrumb([crumb("a", "/a"), crumb("b", null), crumb("c", "/c")])?.key).toBe("a")
		expect(findParentCrumb([crumb("a", "/a"), crumb("b", "/b"), crumb("c", "/c")])?.key).toBe("b")
		expect(findParentCrumb([crumb("c", "/c")])).toBeUndefined()
	})
})
