import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * @module sync-log
 * Concorrência e recuperação de `compras_sync_log`, isoladas por ORIGEM.
 *
 * Este módulo existe separado do `index.ts` por dois motivos:
 *
 *  1. `index.ts` importa `env.ts`, que valida credencial na carga do módulo — um teste
 *     unitário que o importasse quebraria no CI, que não tem as variáveis. A regra do repo é
 *     extrair a função pura em vez de dar env ao teste.
 *  2. A tabela é COMPARTILHADA entre ingestões (Compras.gov e PCA do PNCP). Sem filtro de
 *     origem, um sync do PNCP em `running` bloquearia o sync semanal do CATMAT, seria marcado
 *     como morto pela recuperação alheia e apareceria na tela de rotinas do Compras.gov com o
 *     rótulo errado.
 */

/** Origem do sync do catálogo Compras.gov.br em `compras_sync_log.source`. */
export const COMPRAS_SYNC_SOURCE = "compras_gov"

/** Origem da ingestão do Plano de Contratações Anual do PNCP. */
export const PNCP_PCA_SYNC_SOURCE = "pncp_pca"

const HEARTBEAT_TIMEOUT_MS = 90_000

/** Um sync é vivo se bateu heartbeat recente; sem heartbeat, vale 15 s de margem do início. */
export function isSyncLive(heartbeatAt: string | null, startedAt: string): boolean {
	const threshold = Date.now() - HEARTBEAT_TIMEOUT_MS
	if (!heartbeatAt) {
		return new Date(startedAt).getTime() > Date.now() - 15_000
	}
	return new Date(heartbeatAt).getTime() > threshold
}

/** True se já há sync viva **daquela origem**. Origem alheia nunca bloqueia. */
export async function hasLiveSync(supabase: SupabaseClient<any, any>, source: string = COMPRAS_SYNC_SOURCE): Promise<boolean> {
	const { data, error } = await supabase.from("compras_sync_log").select("id, heartbeat_at, started_at").eq("status", "running").eq("source", source)
	if (error || !data?.length) return false
	return data.some((s: { heartbeat_at: string | null; started_at: string }) => isSyncLive(s.heartbeat_at, s.started_at))
}

/** Marca como `error` as syncs **daquela origem** que morreram sem finalizar. */
export async function recoverStaleSyncs(supabase: SupabaseClient<any, any>, source: string = COMPRAS_SYNC_SOURCE): Promise<void> {
	const { data: stale, error } = await supabase.from("compras_sync_log").select("id, heartbeat_at, started_at").eq("status", "running").eq("source", source)

	if (error || !stale?.length) return

	const dead = stale.filter((s: { heartbeat_at: string | null; started_at: string }) => !isSyncLive(s.heartbeat_at, s.started_at))
	if (!dead.length) return

	for (const log of dead) {
		console.warn(`[${source}] Recovery: sync #${log.id} sem heartbeat — marcando como error`)

		await supabase
			.from("compras_sync_step")
			.update({ status: "error", error_message: "instance_died", finished_at: new Date().toISOString() })
			.eq("sync_id", log.id)
			.in("status", ["running", "pending"])

		await supabase
			.from("compras_sync_log")
			.update({ status: "error", error_message: "API instance died or restarted mid-sync", finished_at: new Date().toISOString() })
			.eq("id", log.id)
	}

	console.log(`[${source}] Recovery: ${dead.length} sync(s) morta(s) marcada(s) como error`)
}
