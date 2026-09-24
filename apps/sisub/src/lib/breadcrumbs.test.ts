import { readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type { NavItem } from "@/components/layout/sidebar/NavItems"
import { applyEntityLabel, buildCrumbs, type CrumbModule, linkCrumbs } from "@/lib/breadcrumbs"
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
		expect(crumbs.map((c) => c.label)).toEqual(["Catálogo Global", "Planos Semanais", "Imprimir", "Plano Semanal"])
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

/** Amostra de `ALL_MODULES` no formato que a trilha consome (mesma razão da `ALL_NAV_ITEMS`). */
const MODULES: CrumbModule[] = [
	{ id: "admin", name: "Administração do Sistema", items: [{ title: "Ambiente de Treino", url: "/admin/training" }] },
	{
		id: "storage",
		name: "Estoque",
		hubUrl: "/storage",
		items: [
			{ title: "Painel", url: "/storage/dashboard" },
			{ title: "Recebimentos", url: "/storage/receiving" },
		],
	},
	{ id: "kitchen", name: "Gestão Cozinha", hubUrl: "/kitchen", items: [{ title: "Cardápios Semanais", url: "/kitchen/weekly-menus" }] },
	{ id: "messhall", name: "Fiscal", hubUrl: "/messhall", items: [{ title: "Presenças", url: "/messhall/" }] },
	{ id: "global", name: "Catálogo Global", items: [{ title: "Insumos", url: "/global/ingredients" }] },
	{ id: "local-analytics", name: "Análises da Unidade", hubUrl: "/local-analytics", items: [{ title: "Painel", url: "/local-analytics/dashboard" }] },
	{ id: "kitchen-production", name: "Produção Cozinha", hubUrl: "/kitchen-production", items: [{ title: "Painel", url: "/kitchen-production/" }] },
	{ id: "unit", name: "Gestão Unidade", hubUrl: "/unit", items: [{ title: "Painel", url: "/unit/dashboard" }] },
	{ id: "diner", name: "Comensal", items: [{ title: "Previsão", url: "/diner/forecast" }] },
	{ id: "analytics", name: "Análises Globais", items: [{ title: "Visão Global", url: "/analytics/global" }] },
]

const trail = (path: string) => linkCrumbs(buildCrumbs(path, ALL_NAV_ITEMS, SCOPE), path, MODULES)

describe("linkCrumbs", () => {
	it("aponta a raiz do módulo sem rota index para o primeiro item visível", () => {
		// `/admin` não existe: o crumb dava "Página não encontrada"
		expect(trail("/admin/training")[0]).toMatchObject({ label: "Administração do Sistema", to: null })
		expect(trail("/admin/permissions")[0]).toMatchObject({ to: "/admin/training" })
	})

	it("aponta a raiz de módulo com escopo para o hub de seleção", () => {
		expect(trail("/storage/7/receiving")[0]).toMatchObject({ label: "Estoque", to: "/storage" })
	})

	it("aponta o escopo para o primeiro item dentro dele, não para o layout sem index", () => {
		expect(trail("/storage/7/receiving")[1]).toMatchObject({ label: "GAP-AF", to: "/storage/7/dashboard" })
		expect(trail("/local-analytics/7/indicators")[1]).toMatchObject({ to: "/local-analytics/7/dashboard" })
	})

	it("não linka o crumb que levaria à própria página", () => {
		// `/kitchen/7` redireciona para o primeiro item — o "voltar" do mobile caía na mesma tela
		const crumbs = trail("/kitchen/7/weekly-menus")
		expect(crumbs[1]).toMatchObject({ label: "GAP-AF", to: null })
		expect(crumbs.at(-1)).toMatchObject({ label: "Cardápios Semanais", to: null })
	})

	it("não linka segmento que não é rota (`print` antes do id)", () => {
		const crumbs = trail(`/global/weekly-plans/print/${FAKE_UUID}`)
		expect(crumbs.map((c) => [c.label, c.to])).toEqual([
			["Catálogo Global", "/global/ingredients"],
			["Planos Semanais", "/global/weekly-plans"],
			["Imprimir", null],
			["Plano Semanal", null],
		])
	})

	it("acrescenta o item index na rota index do escopo", () => {
		expect(trail("/messhall/7").map((c) => [c.label, c.to])).toEqual([
			["Fiscal", "/messhall"],
			["GAP-AF", null],
			["Presenças", null],
		])
	})

	it("usa o nome do módulo da sidebar", () => {
		expect(trail("/local-analytics/7/indicators")[0]?.label).toBe("Análises da Unidade")
	})

	it("a amostra cobre todos os módulos do router", () => {
		const moduleDirs = readdirSync(MODULES_DIR, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
		expect(MODULES.map((m) => m.id).sort()).toEqual(moduleDirs.sort())
	})

	it("cobre todas as rotas sem crumb apontando para layout vazio ou para a própria página", () => {
		for (const path of ROUTE_PATHS) {
			const crumbs = linkCrumbs(buildCrumbs(path, ALL_NAV_ITEMS, SCOPE), path, MODULES)
			const segments = path.split("/").filter(Boolean)
			for (const c of crumbs) {
				if (c.to === null) continue
				expect(c.to.replace(/\/+$/, ""), `crumb "${c.label}" de ${path} aponta para a própria página`).not.toBe(path.replace(/\/+$/, ""))
				// escopo cru (`/storage/7`) é layout sem página em alguns módulos
				expect(c.to, `crumb "${c.label}" de ${path} aponta para o layout do escopo`).not.toBe(`/${segments[0]}/${SCOPE.id}`)
				expect(c.to.endsWith("/print"), `crumb "${c.label}" de ${path} aponta para /print`).toBe(false)
			}
		}
	})
})

describe("applyEntityLabel", () => {
	it("troca o rótulo genérico do registro pelo nome", () => {
		const path = `/kitchen/7/recipes/${FAKE_UUID}/versions`
		const crumbs = applyEntityLabel(trail(path), "Arroz carreteiro")
		expect(crumbs.map((c) => c.label)).toEqual(["Gestão Cozinha", "GAP-AF", "Preparações", "Arroz carreteiro", "Versões"])
	})

	it("nunca renomeia o escopo", () => {
		const crumbs = applyEntityLabel(trail("/storage/7/dashboard"), "Outro nome")
		expect(crumbs[1]?.label).toBe("GAP-AF")
	})

	it("rotula o registro, não o escopo, quando os dois são ids", () => {
		const path = `/storage/7/receiving/${FAKE_UUID}`
		expect(applyEntityLabel(trail(path), "Recebimento de 24/09/2026").map((c) => c.label)).toEqual([
			"Estoque",
			"GAP-AF",
			"Recebimentos",
			"Recebimento de 24/09/2026",
		])
	})

	it("sem nome mantém o genérico", () => {
		const path = `/global/recipes/${FAKE_UUID}`
		expect(applyEntityLabel(trail(path), undefined).at(-1)?.label).toBe("Preparação")
	})
})
