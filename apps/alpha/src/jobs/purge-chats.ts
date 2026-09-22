/**
 * Expurgo das conversas avulsas não salvas (Política de Privacidade do contrate).
 *
 * Uma vez por dia, dentro do processo — o mesmo modelo de `scheduler.ts`. Apaga, em lotes,
 * a conversa sem `submission_id`, sem `saved_at` e com a última atividade há 180 dias ou
 * mais, pelo MESMO caminho do `DELETE /chats/:id` (`removeThread`): arquivos antes da linha.
 * Conversa cujo arquivo não saiu do Storage fica para a próxima rodada.
 *
 * Com várias tasks do ECS, todas rodam a rotina. É inofensivo e não pede trava: a seleção é
 * por prazo e remover o que já foi removido não é erro.
 *
 * Ligada por padrão (`ALPHA_CHAT_PURGE_ENABLED`): é compromisso declarado, não otimização.
 * Ligar no deploy não apaga nada — nenhuma conversa alcança 180 dias antes de 180 dias.
 */

import { purgeTurnUsage } from "../chat/rate-limit.ts"
import { isPurgeable, purgeCutoff } from "../chat/retention.ts"
import { removeThread, THREAD_COLUMNS, type ThreadRow } from "../chat/threads.ts"
import { supabase } from "../db/supabase.ts"

const DAY_MS = 24 * 60 * 60 * 1000

/** Atraso inicial para não competir com o boot/deploy. */
const INITIAL_DELAY_MS = 10 * 60 * 1000

export const PURGE_BATCH = 100

/** Teto de lotes por rodada: uma fila enorme termina no dia seguinte, não trava o processo. */
const MAX_BATCHES = 20

export interface PurgeReport {
	removed: number
	failed: number
	/** Registros do teto diário que já saíram da janela (`chat_turn_usage`). */
	usage: number
}

export async function purgeExpiredChats(now: Date = new Date()): Promise<PurgeReport> {
	const report: PurgeReport = { removed: 0, failed: 0, usage: await purgeTurnUsage(now) }
	const failedIds = new Set<string>()

	for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
		const { data, error } = await supabase
			.from("chat_thread")
			.select(THREAD_COLUMNS)
			.is("submission_id", null)
			.is("saved_at", null)
			.lte("last_activity_at", purgeCutoff(now).toISOString())
			.order("last_activity_at", { ascending: true })
			.limit(PURGE_BATCH + failedIds.size)
		if (error) throw new Error(`conversas expiradas não lidas: ${error.message}`)

		// A regra pura confere de novo cada linha: a consulta é o filtro barato, a função é a
		// mesma que a API usa para anunciar `purge_at`.
		const candidates = ((data ?? []) as ThreadRow[]).filter((thread) => !failedIds.has(thread.id) && isPurgeable(thread, now))
		if (candidates.length === 0) break

		for (const thread of candidates) {
			const outcome = await removeThread(thread.id)
			if (outcome.ok) report.removed += 1
			else {
				report.failed += 1
				failedIds.add(thread.id)
				console.error(`[jobs] conversa ${thread.id} não expurgada (${outcome.reason}): ${outcome.message}`)
			}
		}
		if (candidates.length < PURGE_BATCH) break
	}

	return report
}

export function startChatPurgeWorker(enabled: boolean): { stop: () => void } {
	if (!enabled) return { stop: () => {} }

	let timer: ReturnType<typeof setTimeout> | undefined
	const run = async () => {
		try {
			const report = await purgeExpiredChats()
			if (report.removed > 0 || report.failed > 0) console.info(`[jobs] expurgo de conversas: ${report.removed} apagada(s), ${report.failed} com falha`)
		} catch (error) {
			console.error("[jobs] expurgo de conversas falhou", error)
		} finally {
			timer = setTimeout(run, DAY_MS)
		}
	}
	timer = setTimeout(run, INITIAL_DELAY_MS)

	return {
		stop: () => {
			if (timer) clearTimeout(timer)
		},
	}
}
