/**
 * Script standalone para executar o sync do CATMAT/CATSER manualmente.
 * Uso: bun run scripts/run-compras-sync.ts
 */
import { runComprasSync } from "../src/workers/compras-sync/index.ts"

console.log("[run-sync] Iniciando sync manual do CATMAT...")

try {
	const syncId = await runComprasSync({ triggeredBy: "manual" })
	if (syncId === -1) {
		console.log("[run-sync] Sync já estava em andamento. Abortando.")
		process.exit(1)
	}
	console.log(`[run-sync] Sync #${syncId} concluída com sucesso.`)
	process.exit(0)
} catch (err) {
	console.error("[run-sync] Erro na sync:", err)
	process.exit(1)
}
