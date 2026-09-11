/**
 * Contrato NEGATIVO: rota e leitura NUNCA exigem garantia de identidade (design.md D3).
 *
 * Se o guard de rota exigisse elevação, abrir `/admin/permissions` para *consultar* pediria o
 * código de 6 dígitos. Navegação que pede segundo fator é exatamente o que treina as pessoas a
 * digitar código sem ler o motivo — e aí o controle inteiro vira teatro. A regra da spec é
 * curta: `minAal` só em server function de mutação e em ação explícita de exportação.
 *
 * Este teste falha quando alguém liga o eixo de garantia no lugar errado. Não é hipótese
 * defensiva: o registro de classificação já existe e está preenchido, e o caminho mais curto
 * para "proteger a tela de permissões" é chamar o guard no `beforeLoad`. A suíte tem que dizer
 * não antes da revisão.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const routesDir = join(srcDir, "routes")

/**
 * Símbolos que só aparecem quando alguém exige garantia. `MFA_REQUIRED` entra na lista porque
 * tratar o erro na rota é o outro jeito de a elevação vazar para a navegação: o `beforeLoad`
 * que captura o código e redireciona para um desafio produz o mesmo efeito que exigi-lo.
 */
const ASSURANCE_SYMBOLS = [
	"requireAssurance",
	"assertAssurance",
	"satisfiesAssurance",
	"enforcedAssuranceFor",
	"AssuranceRequiredError",
	"MFA_REQUIRED",
	"minAal",
]

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) return walk(full)
		return entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) ? [full] : []
	})
}

const routeFiles = walk(routesDir).filter((file) => !file.endsWith("routeTree.gen.ts"))

describe("garantia de identidade não alcança rota nem leitura", () => {
	test("o scanner enxerga as rotas e os guards (proteção contra um teste que passa vazio)", () => {
		expect(routeFiles.length).toBeGreaterThan(50)
		const withGuard = routeFiles.filter((file) => readFileSync(file, "utf8").includes("beforeLoad"))
		expect(withGuard.length).toBeGreaterThan(10)
	})

	test("nenhum arquivo de rota exige garantia de identidade", () => {
		const offenders: string[] = []

		for (const file of routeFiles) {
			const source = readFileSync(file, "utf8")
			for (const symbol of ASSURANCE_SYMBOLS) {
				if (source.includes(symbol)) offenders.push(`${relative(srcDir, file)} — usa \`${symbol}\``)
			}
		}

		expect(offenders, "rota exigindo segundo fator: a spec proíbe elevação em navegação e em leitura").toEqual([])
	})

	test("o helper de `beforeLoad` continua cego ao eixo de garantia", () => {
		// `requirePermission(opts, "admin", 3)` decide por módulo/nível e nada mais. Aceitar um
		// piso aqui transformaria TODA rota protegida num ponto de elevação de uma vez só.
		const source = readFileSync(join(srcDir, "auth", "pbac.ts"), "utf8")
		for (const symbol of ASSURANCE_SYMBOLS) expect(source, `auth/pbac.ts usa \`${symbol}\``).not.toContain(symbol)
	})
})
