/**
 * Script standalone para sincronizar apenas o CATMAT alimentício (grupo 89).
 * Uso:
 *   bun run scripts/run-compras-food-sync.ts
 *   bun run scripts/run-compras-food-sync.ts --concurrency=6
 */
import { runFoodMaterialSync } from "../src/workers/compras-sync/material-food.ts"

function parseConcurrency(): number | undefined {
	const arg = Bun.argv.slice(2).find((value) => value.startsWith("--concurrency="))
	if (!arg) return undefined
	const value = Number(arg.split("=")[1])
	return Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined
}

const detailConcurrency = parseConcurrency()

console.log(`[food-sync] iniciando sync alimentício${detailConcurrency ? ` com concorrência ${detailConcurrency}` : ""}`)

try {
	const summary = await runFoodMaterialSync({
		detailConcurrency,
		syncUnits: true,
	})

	console.log("[food-sync] resumo final:")
	console.log(JSON.stringify(summary, null, 2))

	if (summary.errors.length > 0) {
		process.exit(1)
	}

	process.exit(0)
} catch (error) {
	console.error("[food-sync] erro fatal:", error)
	process.exit(1)
}
