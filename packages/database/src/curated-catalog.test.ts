import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * O catálogo de itens de compra é CURADO À MÃO — e nenhum script escreve nele.
 *
 * O CATMAT de cada item de compra foi escolhido na tela, item a item, pelas nutricionistas
 * da SDAB. Até 2026-09-26 existia `apps/api/scripts/catmat-match-orchestrator.ts`, que
 * decidia o CATMAT por similaridade de texto e gravava por cima — inclusive `null` quando
 * não achava candidato — em todo item sem `catmat_match_status` (e em TODOS com
 * `--reprocess-all`). A escolha manual pela tela não preenchia esse status, então a próxima
 * execução apagaria o trabalho delas. O script foi removido; este teste impede que ele — ou
 * outro com a mesma ideia — volte.
 *
 * Vale para scripts e workers (o que roda fora da tela, em lote). Migration fica de fora: ela
 * passa por revisão do mantenedor e é aplicada à mão, uma vez.
 * O caminho de escrita legítimo é a tela, pelas server functions de `purchase_item.fn.ts`,
 * que gravam versão de cada insumo afetado (`withIngredientVersions`).
 */

const ROOT = join(import.meta.dir, "..", "..", "..")

/** Onde mora código que roda em lote, sem um humano escolhendo item a item. */
const BATCH_DIRS = ["scripts", "apps/api/scripts", "apps/api/src/workers", "apps/sisub/scripts", "packages/database/scripts"]

function sourceFiles(dir: string): string[] {
	let entries: string[]
	try {
		entries = readdirSync(dir)
	} catch {
		return []
	}
	return entries.flatMap((name) => {
		const path = join(dir, name)
		if (name === "node_modules") return []
		if (statSync(path).isDirectory()) return sourceFiles(path)
		return /\.(ts|tsx|js|mjs|sql)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
	})
}

/** Escrita em `procurement.purchase_item` — PostgREST, Drizzle ou SQL. */
const WRITES_PURCHASE_ITEM = [
	/\.from\(\s*["']purchase_item["']\s*\)[\s\S]{0,400}?\.(?:update|upsert|insert|delete)\(/,
	/\.(?:update|insert|delete)\(\s*purchaseItemInProcurement\s*\)/,
	/\b(?:update|insert\s+into|delete\s+from)\s+procurement\.purchase_item\b(?!_)/i,
]

describe("catálogo de itens de compra curado", () => {
	const files = BATCH_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)))

	test("a varredura encontra os scripts (proteção contra teste que passa vazio)", () => {
		expect(files.some((file) => file.endsWith("run-compras-food-sync.ts"))).toBe(true)
	})

	test("nenhum script ou worker escreve em procurement.purchase_item", () => {
		const offenders = files
			.filter((file) => {
				const source = readFileSync(file, "utf8")
				return WRITES_PURCHASE_ITEM.some((pattern) => pattern.test(source))
			})
			.map((file) => relative(ROOT, file))
		expect(offenders, "script em lote escrevendo no catálogo curado. O CATMAT e a especificação são escolhidos na tela; ver o cabeçalho deste teste.").toEqual(
			[]
		)
	})

	test("o orquestrador de correlação CATMAT não voltou", () => {
		expect(files.some((file) => file.includes("catmat-match-orchestrator"))).toBe(false)
		const apiPackage = readFileSync(join(ROOT, "apps/api/package.json"), "utf8")
		expect(apiPackage).not.toContain("catmat-match")
	})
})
