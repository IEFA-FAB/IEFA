import { readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { NavItem } from "@/components/layout/sidebar/NavItems"
import { buildCrumbs } from "@/lib/breadcrumbs"
import type { ScopeContext } from "@/types/domain/scope"

const MODULES_DIR = fileURLToPath(new URL("../routes/_protected/_modules", import.meta.url))

const SCOPE: ScopeContext = { id: 7, name: "GAP-AF" }
const FAKE_UUID = "0f8fad5b-d9cb-469f-a165-70867728950e"

/**
 * Amostra da sidebar (URLs base, sem escopo) — copiada de `ALL_MODULES`, que não pode ser
 * importada aqui: a cadeia `NavItems → auth/pbac → supabase → env` exige as vars de ambiente.
 * A cobertura completa não depende dela: o segundo bloco roda com a sidebar vazia.
 */
const ALL_NAV_ITEMS: NavItem[] = [
	{ to: "/unit/reconciliation", label: "Conciliação" },
	{ to: "/messhall/", label: "Presenças" },
	{ to: "/kitchen/recipes", label: "Preparações" },
	{ to: "/storage/dashboard", label: "Painel" },
	{ to: "/global/weekly-plans", label: "Planos Semanais" },
]

/**
 * Enumera as URLs reais do router a partir dos arquivos de rota, com os parâmetros
 * dinâmicos substituídos: o de escopo pelo id do `SCOPE`, os demais por um UUID.
 */
function collectRoutePaths(dir: string, prefix = ""): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			out.push(...collectRoutePaths(join(dir, entry.name), `${prefix}/${entry.name}`))
			continue
		}
		if (!entry.name.endsWith(".tsx")) continue
		const base = entry.name.replace(/\.tsx$/, "")
		// "route" e "index" não acrescentam segmento; "print.$planId" vira "print/$planId"
		if (base === "route" || base === "index") {
			out.push(prefix)
			continue
		}
		out.push(`${prefix}/${base.split(".").join("/")}`)
	}
	return out
}

function materialize(routePath: string): string {
	const segments = routePath.split("/").filter(Boolean)
	return `/${segments.map((seg, i) => (seg.startsWith("$") ? (i === 1 ? String(SCOPE.id) : FAKE_UUID) : seg)).join("/")}`
}

const ROUTE_PATHS = [...new Set(collectRoutePaths(MODULES_DIR))].filter(Boolean).map(materialize).sort()

describe("buildCrumbs — cobertura das rotas do AppShell", () => {
	it("enumera as rotas dos módulos (guarda contra scan vazio)", () => {
		expect(ROUTE_PATHS.length).toBeGreaterThan(50)
	})

	it.each(ROUTE_PATHS)("%s tem rótulo legível em todos os segmentos", (path) => {
		const crumbs = buildCrumbs(path, ALL_NAV_ITEMS, SCOPE)
		const segments = path.split("/").filter(Boolean)

		expect(crumbs).toHaveLength(segments.length)
		for (const [i, crumb] of crumbs.entries()) {
			const seg = segments[i] as string
			// Sem tradução, o segmento cru vaza para a UI ("reconciliation", "empenhos"…)
			expect(crumb.label, `segmento "${seg}" sem rótulo em ${path}`).not.toBe(seg)
			// Fallbacks genéricos: o recurso pai não está mapeado
			expect(crumb.label, `segmento "${seg}" caiu no fallback genérico em ${path}`).not.toBe("Detalhe")
			expect(crumb.label, `segmento "${seg}" caiu no fallback genérico em ${path}`).not.toBe("Novo")
		}
	})

	// A sidebar não é filtrada por permissão aqui; um usuário sem o item continua
	// abrindo a rota (o minLevel do item é mais restrito que o da rota em vários casos).
	it.each(ROUTE_PATHS)("%s tem rótulo legível também sem a sidebar", (path) => {
		const crumbs = buildCrumbs(path, [], SCOPE)
		const segments = path.split("/").filter(Boolean)
		for (const [i, crumb] of crumbs.entries()) {
			const seg = segments[i] as string
			expect(crumb.label, `segmento "${seg}" sem rótulo estático em ${path}`).not.toBe(seg)
			expect(crumb.label).not.toBe("Detalhe")
			expect(crumb.label).not.toBe("Novo")
		}
	})
})

describe("buildCrumbs", () => {
	it("traduz páginas de módulo escopado a partir da URL base da sidebar", () => {
		const crumbs = buildCrumbs("/unit/7/reconciliation", ALL_NAV_ITEMS, SCOPE)
		expect(crumbs.map((c) => c.label)).toEqual(["Gestão Unidade", "GAP-AF", "Conciliação"])
		expect(crumbs.map((c) => c.to)).toEqual(["/unit", "/unit/7", "/unit/7/reconciliation"])
	})

	it("mantém o nome do módulo quando a sidebar aponta para a rota index", () => {
		// "/messhall/" é a URL do item "Presenças"; não pode virar o rótulo do módulo
		const crumbs = buildCrumbs("/messhall/7", ALL_NAV_ITEMS, SCOPE)
		expect(crumbs.map((c) => c.label)).toEqual(["Fiscal", "GAP-AF"])
	})

	it("usa o nome do escopo no id do módulo e o recurso pai nos demais ids", () => {
		const crumbs = buildCrumbs(`/kitchen/7/recipes/${FAKE_UUID}/versions`, ALL_NAV_ITEMS, SCOPE)
		expect(crumbs.map((c) => c.label)).toEqual(["Gestão Cozinha", "GAP-AF", "Preparações", "Preparação", "Versões"])
	})

	it("atravessa segmentos sem recurso próprio ao rotular um id", () => {
		const crumbs = buildCrumbs(`/global/weekly-plans/print/${FAKE_UUID}`, ALL_NAV_ITEMS, SCOPE)
		expect(crumbs.map((c) => c.label)).toEqual(["SDAB", "Planos Semanais", "Imprimir", "Plano Semanal"])
	})

	it("rotula 'new' pelo recurso pai", () => {
		expect(buildCrumbs("/kitchen/7/exceptions/new", ALL_NAV_ITEMS, SCOPE).at(-1)?.label).toBe("Nova Exceção")
	})

	it("resolve o escopo do estoque pelo nome da cozinha", () => {
		const crumbs = buildCrumbs("/storage/7/dashboard", ALL_NAV_ITEMS, SCOPE)
		expect(crumbs.map((c) => c.label)).toEqual(["Estoque", "GAP-AF", "Painel"])
	})

	it("trata a raiz como Hub", () => {
		expect(buildCrumbs("/", ALL_NAV_ITEMS)).toEqual([{ to: "/hub", label: "Hub" }])
	})
})
