import { existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { LEGACY_ROUTE_PREFIXES, resolveLegacyPath } from "@/lib/legacy-routes"

const MODULES_DIR = fileURLToPath(new URL("../routes/_protected/_modules", import.meta.url))
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e"

// Os casos citam o caminho antigo sempre como `from:`: é a forma que o gate da linguagem ubíqua
// (`.opengrep/rules/ubiquitous-language.yaml`) aceita para o nome descartado.
const REDIRECTED: readonly { from: string; to: string }[] = [
	{ from: "/kitchen/7/suprimentos", to: "/kitchen/7/demand-forecasts" },
	{ from: "/kitchen/7/suprimentos/", to: "/kitchen/7/demand-forecasts" },
	{ from: "/kitchen/7/suprimentos/new", to: "/kitchen/7/demand-forecasts/new" },
	{ from: `/kitchen/7/suprimentos/${UUID}`, to: `/kitchen/7/demand-forecasts/${UUID}` },
	{ from: "/unit/12/liquidations", to: "/unit/12/liquidacoes" },
	{ from: "/unit/12/payments", to: "/unit/12/pagamentos" },
	{ from: "/global/weekly-plans", to: "/global/weekly-menus" },
	{ from: "/global/weekly-plans/new", to: "/global/weekly-menus/new" },
	{ from: `/global/weekly-plans/${UUID}`, to: `/global/weekly-menus/${UUID}` },
	{ from: `/global/weekly-plans/print/${UUID}`, to: `/global/weekly-menus/print/${UUID}` },
]

const NOT_LEGACY: readonly { from: string }[] = [
	{ from: "/kitchen/7/demand-forecasts" },
	{ from: "/kitchen/7/weekly-menus" },
	{ from: "/unit/12/liquidacoes" },
	{ from: "/unit/12/pagamentos" },
	{ from: "/global/weekly-menus" },
	// Só o prefixo exato: segmento parecido ou sem o escopo não é caminho antigo.
	{ from: "/unit/12/payments-report" },
	{ from: "/kitchen/suprimentos" },
	{ from: "/" },
]

describe("resolveLegacyPath", () => {
	it.each(REDIRECTED)("$from → $to (parâmetro e cauda preservados)", ({ from, to }) => {
		expect(resolveLegacyPath(from)).toBe(to)
	})

	it.each(NOT_LEGACY)("$from não é caminho antigo", ({ from }) => {
		expect(resolveLegacyPath(from)).toBeNull()
	})

	it("aceita um mapa próprio (o dos próximos lotes)", () => {
		const prefixes = [{ from: "/unit/:unitId/procurement", to: "/unit/:unitId/quantity-estimates" }]
		expect(resolveLegacyPath(`/unit/3/procurement/${UUID}`, prefixes)).toBe(`/unit/3/quantity-estimates/${UUID}`)
	})

	it("todo destino é uma rota que existe e nenhuma origem é rota viva", () => {
		const routePath = (path: string) =>
			join(
				MODULES_DIR,
				...path
					.split("/")
					.filter(Boolean)
					.map((s) => (s.startsWith(":") ? `$${s.slice(1)}` : s))
			)
		for (const { from, to } of LEGACY_ROUTE_PREFIXES) {
			const target = routePath(to)
			expect(existsSync(target) || existsSync(`${target}.tsx`), `destino ${to} sem rota`).toBe(true)
			const source = routePath(from)
			// Rota viva no caminho antigo casaria antes do redirect, que nunca rodaria.
			expect(existsSync(source) || existsSync(`${source}.tsx`), `origem ${from} ainda tem rota`).toBe(false)
		}
	})
})
