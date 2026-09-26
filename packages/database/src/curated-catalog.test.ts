import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * O catálogo de itens de compra é CURADO À MÃO — só a tela escreve nele.
 *
 * O CATMAT de cada item de compra foi escolhido na tela, item a item, pelas nutricionistas
 * da SDAB. Até 2026-09-26 existia `apps/api/scripts/catmat-match-orchestrator.ts`, que
 * decidia o CATMAT por similaridade de texto e gravava por cima — inclusive `null` quando
 * não achava candidato — em todo item sem `catmat_match_status` (e em TODOS com
 * `--reprocess-all`). A escolha manual pela tela não preenchia esse status, então a próxima
 * execução apagaria o trabalho delas. O script foi removido; este teste impede que ele — ou
 * outro com a mesma ideia — volte.
 *
 * Regra: o único código que escreve em `procurement.purchase_item` é a operação de domínio,
 * chamada pelas server functions de `purchase_item.fn.ts` (que gravam versão de cada insumo
 * afetado). Migration fica de fora: passa por revisão do mantenedor e é aplicada à mão.
 *
 * Em CI os testes rodam sem cache do turbo, então a varredura vê todo arquivo novo. Numa
 * rodada local com cache, um script novo fora deste pacote pode não invalidar o resultado.
 */

const ROOT = join(import.meta.dir, "..", "..", "..")

/** Quem pode escrever — com o motivo. */
const ALLOWED_WRITERS: Record<string, string> = {
	"packages/sisub-domain/src/operations/purchase-item.ts": "a operação de domínio que a tela usa (create/update/delete do catálogo)",
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".output", ".turbo", ".vinxi", "migrations", "drizzle", ".tanstack"])

function sourceFiles(dir: string): string[] {
	let entries: string[]
	try {
		entries = readdirSync(dir)
	} catch {
		return []
	}
	return entries.flatMap((name) => {
		if (SKIP_DIRS.has(name) || name.startsWith(".")) return []
		const path = join(dir, name)
		if (statSync(path).isDirectory()) return sourceFiles(path)
		return /\.(ts|tsx|js|mjs|sql)$/.test(name) && !/\.test\.tsx?$|generated\.ts$|routeTree\.gen\.ts$/.test(name) ? [path] : []
	})
}

/** Escrita em `procurement.purchase_item` — PostgREST, Drizzle (inclusive com alias) ou SQL (inclusive com aspas). */
function writesPurchaseItem(source: string): boolean {
	if (/\.from\(\s*["'`]purchase_item["'`]\s*\)[\s\S]{0,400}?\.(?:update|upsert|insert|delete)\(/.test(source)) return true
	const drizzleNames = ["purchaseItemInProcurement", ...[...source.matchAll(/purchaseItemInProcurement\s+as\s+(\w+)/g)].map((m) => m[1] as string)]
	if (drizzleNames.some((name) => new RegExp(`\\.(?:update|insert|delete)\\(\\s*${name}\\s*\\)`).test(source))) return true
	return /\b(?:update|insert\s+into|delete\s+from)\s+"?procurement"?\s*\.\s*"?purchase_item"?(?![_\w])/i.test(source)
}

describe("catálogo de itens de compra curado", () => {
	const files = ["apps", "packages", "scripts"].flatMap((dir) => sourceFiles(join(ROOT, dir)))

	test("a varredura encontra o escritor legítimo e os scripts (proteção contra teste que passa vazio)", () => {
		const scanned = new Set(files.map((file) => relative(ROOT, file)))
		expect(scanned.has("packages/sisub-domain/src/operations/purchase-item.ts")).toBe(true)
		expect(scanned.has("apps/api/scripts/run-compras-food-sync.ts")).toBe(true)
	})

	test("a detecção reconhece as formas de escrita", () => {
		expect(writesPurchaseItem(`supabase.schema("procurement").from("purchase_item").update({ catmat_item_codigo: 1 })`)).toBe(true)
		expect(writesPurchaseItem(`import { purchaseItemInProcurement as pi } from "x"; db.update(pi).set({})`)).toBe(true)
		expect(writesPurchaseItem(`sql\`UPDATE "procurement"."purchase_item" SET catmat_item_codigo = 1\``)).toBe(true)
		expect(writesPurchaseItem(`db.select().from(purchaseItemInProcurement)`)).toBe(false)
		expect(writesPurchaseItem(`update procurement.purchase_item_ingredient set is_default = false`)).toBe(false)
	})

	test("só o escritor permitido escreve em procurement.purchase_item", () => {
		const offenders = files
			.map((file) => relative(ROOT, file))
			.filter((file) => !(file in ALLOWED_WRITERS) && !file.endsWith("curated-catalog.test.ts"))
			.filter((file) => writesPurchaseItem(readFileSync(join(ROOT, file), "utf8")))
		expect(
			offenders,
			"escrita no catálogo curado fora da operação de domínio. O CATMAT e a especificação são escolhidos na tela; ver o cabeçalho deste teste."
		).toEqual([])
	})

	test("o orquestrador de correlação CATMAT não voltou", () => {
		expect(files.some((file) => file.includes("catmat-match-orchestrator"))).toBe(false)
		expect(readFileSync(join(ROOT, "apps/api/package.json"), "utf8")).not.toContain("catmat-match")
	})
})
