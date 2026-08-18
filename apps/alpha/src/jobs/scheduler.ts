/**
 * Agendador da atualização de fontes.
 *
 * Roda dentro do próprio processo, como os workers de sync do `@iefa/api`, em
 * vez de virar uma scheduled task de infraestrutura: o alpha já roda como
 * serviço contínuo, e um timer interno é testável e reversível por variável de
 * ambiente. Trocar por EventBridge depois é só parar de habilitar isto e
 * chamar `POST /internal/jobs/sources/refresh` de fora.
 *
 * Desligado por padrão. A primeira coleta é sempre manual e conferida.
 */

import { refreshAllSources } from "./refresh-sources.ts"

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Atraso inicial para não coletar durante o boot/deploy. */
const INITIAL_DELAY_MS = 5 * 60 * 1000

export function startSourcesRefreshWorker(enabled: boolean): { stop: () => void } {
	if (!enabled) return { stop: () => {} }

	let timer: ReturnType<typeof setTimeout> | undefined

	const run = async () => {
		try {
			const report = await refreshAllSources({ apply: true })
			const failures = report.sources.filter((source) => source.error).length
			const flagged = report.impact.reduce((total, impact) => total + impact.rules_flagged, 0)
			console.info(`[jobs] fontes atualizadas: ${report.sources.length} fonte(s), ${failures} com erro, ${flagged} regra(s) marcada(s) para revisão`)
		} catch (error) {
			// Falha aqui não pode derrubar o serviço: o erro por fonte já foi
			// gravado em normative_source.last_error e aparece no console.
			console.error("[jobs] atualização de fontes falhou", error)
		} finally {
			timer = setTimeout(run, WEEK_MS)
		}
	}

	timer = setTimeout(run, INITIAL_DELAY_MS)

	return {
		stop: () => {
			if (timer) clearTimeout(timer)
		},
	}
}
