import { existsSync, readdirSync } from "node:fs"
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
	{ from: "/unit/12/procurement", to: "/unit/12/quantity-estimates" },
	{ from: "/unit/12/procurement/new", to: "/unit/12/quantity-estimates/new" },
	{ from: `/unit/12/procurement/${UUID}`, to: `/unit/12/quantity-estimates/${UUID}` },
	{ from: `/unit/12/procurement/print/quantities/${UUID}`, to: `/unit/12/quantity-estimates/print/calculation-memory/${UUID}` },
	{ from: `/unit/12/procurement/print/price-research/${UUID}`, to: `/unit/12/quantity-estimates/print/price-research/${UUID}` },
]

const NOT_LEGACY: readonly { from: string }[] = [
	{ from: "/kitchen/7/demand-forecasts" },
	{ from: "/kitchen/7/weekly-menus" },
	{ from: "/unit/12/liquidacoes" },
	{ from: "/unit/12/pagamentos" },
	{ from: "/global/weekly-menus" },
	{ from: "/unit/12/quantity-estimates" },
	{ from: "/unit/12/flows/procurement-planning" },
	{ from: "/analytics/procurement-plan" },
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
		const prefixes = [{ from: "/diner/forecast", to: "/diner/arranchamento" }]
		expect(resolveLegacyPath("/diner/forecast", prefixes)).toBe("/diner/arranchamento")
	})

	it("todo destino é uma rota que existe e nenhuma origem é rota viva", () => {
		// Diretório, arquivo `<segmento>.tsx` ou rota plana do TanStack (`print.calculation-memory.$id.tsx`
		// dentro do diretório pai): as três formas geram o mesmo caminho.
		const routeExists = (path: string) => {
			const segments = path
				.split("/")
				.filter(Boolean)
				.map((s) => (s.startsWith(":") ? `$${s.slice(1)}` : s))
			for (let split = segments.length; split >= 1; split--) {
				const dir = join(MODULES_DIR, ...segments.slice(0, split))
				const rest = segments.slice(split).join(".")
				if (rest === "" && (existsSync(dir) || existsSync(`${dir}.tsx`))) return true
				const parent = join(MODULES_DIR, ...segments.slice(0, split))
				if (rest !== "" && existsSync(parent) && readdirSync(parent).some((f) => f === `${rest}.tsx` || f.startsWith(`${rest}.`))) return true
			}
			return false
		}
		for (const { from, to } of LEGACY_ROUTE_PREFIXES) {
			expect(routeExists(to), `destino ${to} sem rota`).toBe(true)
			// Rota viva no caminho antigo casaria antes do redirect, que nunca rodaria.
			expect(routeExists(from), `origem ${from} ainda tem rota`).toBe(false)
		}
	})
})
