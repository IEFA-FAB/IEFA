/**
 * Script standalone para verificar releases das tabelas alimentares institucionais.
 * Uso: bun run scripts/run-nutrition-reference-sync.ts
 */
import { runNutritionReferenceSync } from "../src/workers/nutrition-reference-sync/index.ts"

console.log("[run-nutrition-sync] Iniciando sync manual de tabelas alimentares...")

try {
	const syncId = await runNutritionReferenceSync({ triggeredBy: "manual" })
	console.log(`[run-nutrition-sync] Sync concluída. ID: ${syncId}`)
	process.exit(0)
} catch (error) {
	console.error("[run-nutrition-sync] Falha:", error)
	process.exit(1)
}
