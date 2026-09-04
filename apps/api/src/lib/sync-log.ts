import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * @module sync-log
 * Controle de execução compartilhado por TODAS as integrações.
 *
 * Uma tabela (`compras_gov_integration.integration_sync_log`), discriminada por `source`; cada
 * painel filtra a sua. Antes disso, cada worker tinha o seu par de tabelas e uma cópia inteira
 * da lógica de heartbeat, liveness e recuperação — três cópias, três oportunidades de divergir.
 *
 * Duas garantias que este módulo existe para dar:
 *
 *  1. **Uma execução viva por origem, garantida pelo BANCO.** `claimSync` não faz
 *     "consulta se há sync viva e insere" — esse padrão é uma corrida: dois disparos passam os
 *     dois pela consulta. Ele tenta inserir e deixa o índice parcial único
 *     (`uq_integration_sync_log_one_running_per_source`) recusar o segundo com 23505.
 *  2. **Recuperação isolada por origem.** Sem o filtro, o `recoverStaleSyncs` de um worker marca
 *     `instance_died` na execução saudável de outro.
 *
 * Este módulo NÃO importa `env.ts` de propósito: teste unitário que o importasse quebraria no CI,
 * que não tem as credenciais.
 */

/** Origens conhecidas. Uma origem nova entra aqui, não numa tabela nova. */
export const SYNC_SOURCES = {
	comprasGov: "compras_gov",
	nutritionReference: "nutrition_reference",
	pncpPca: "pncp_pca",
} as const

export type SyncSource = (typeof SYNC_SOURCES)[keyof typeof SYNC_SOURCES]

export const SYNC_LOG_TABLE = "integration_sync_log"
export const SYNC_STEP_TABLE = "integration_sync_step"

/**
 * Um sync sem heartbeat por mais que isto é considerado morto e recuperável.
 *
 * O valor precisa ser MAIOR que o intervalo entre duas batidas de qualquer worker. Quem tem
 * etapa longa bate no meio dela — foi assim que a ingestão do PCA, cujo único ano leva mais de
 * 90 s, era declarada morta por um disparo concorrente.
 */
export const HEARTBEAT_TIMEOUT_MS = 90_000

/** Margem para a execução recém-criada que ainda não bateu o primeiro heartbeat. */
const STARTUP_GRACE_MS = 15_000

/** Código do Postgres para violação de unicidade — aqui, "já há execução viva desta origem". */
const UNIQUE_VIOLATION = "23505"

export function isSyncLive(heartbeatAt: string | null, startedAt: string): boolean {
	if (!heartbeatAt) return new Date(startedAt).getTime() > Date.now() - STARTUP_GRACE_MS
	return new Date(heartbeatAt).getTime() > Date.now() - HEARTBEAT_TIMEOUT_MS
}

type Db = SupabaseClient<any, any>

/** True se há execução viva **daquela origem**. Origem alheia nunca bloqueia. */
export async function hasLiveSync(supabase: Db, source: SyncSource): Promise<boolean> {
	const { data, error } = await supabase.from(SYNC_LOG_TABLE).select("id, heartbeat_at, started_at").eq("status", "running").eq("source", source)
	if (error || !data?.length) return false
	return data.some((s: { heartbeat_at: string | null; started_at: string }) => isSyncLive(s.heartbeat_at, s.started_at))
}

/**
 * Marca como `error` as execuções **daquela origem** que morreram sem finalizar.
 *
 * Precisa rodar antes de `claimSync`: sem isso, uma instância que morreu deixa a linha em
 * `running` e o índice único bloqueia toda execução seguinte — o lock viraria permanente.
 */
export async function recoverStaleSyncs(supabase: Db, source: SyncSource): Promise<number> {
	const { data: stale, error } = await supabase.from(SYNC_LOG_TABLE).select("id, heartbeat_at, started_at").eq("status", "running").eq("source", source)

	if (error || !stale?.length) return 0

	const dead = stale.filter((s: { heartbeat_at: string | null; started_at: string }) => !isSyncLive(s.heartbeat_at, s.started_at))
	if (!dead.length) return 0

	for (const log of dead) {
		console.warn(`[${source}] Recovery: sync #${log.id} sem heartbeat — marcando como error`)

		await supabase
			.from(SYNC_STEP_TABLE)
			.update({ status: "error", error_message: "instance_died", finished_at: new Date().toISOString() })
			.eq("sync_id", log.id)
			.in("status", ["running", "pending"])

		await supabase
			.from(SYNC_LOG_TABLE)
			.update({ status: "error", error_message: "API instance died or restarted mid-sync", finished_at: new Date().toISOString() })
			.eq("id", log.id)
	}

	console.log(`[${source}] Recovery: ${dead.length} sync(s) morta(s) marcada(s) como error`)
	return dead.length
}

export interface ClaimSyncOptions {
	source: SyncSource
	/**
	 * Preservado como veio. Não é enum de propósito: a nutrição usa `test` para a execução
	 * reduzida, e colapsar isso em `manual` apagaria o rótulo que o painel dela exibe.
	 */
	triggeredBy: string
	totalSteps: number
}

export type ClaimResult = { claimed: true; syncId: number } | { claimed: false; reason: "already_running" }

/**
 * Recupera execuções mortas e tenta tomar a vaga da origem.
 *
 * A exclusão é do BANCO, não desta função: a inserção compete pelo índice parcial único e a
 * perdedora recebe 23505. Por isso não existe janela entre "verificar" e "inserir" — é a
 * diferença entre uma corrida improvável e uma corrida impossível.
 */
export async function claimSync(supabase: Db, opts: ClaimSyncOptions): Promise<ClaimResult> {
	await recoverStaleSyncs(supabase, opts.source)

	const { data, error } = await supabase
		.from(SYNC_LOG_TABLE)
		.insert({
			triggered_by: opts.triggeredBy,
			total_steps: opts.totalSteps,
			source: opts.source,
			status: "running",
			// Primeiro heartbeat no próprio insert: sem ele a execução vive só a margem de 15 s.
			heartbeat_at: new Date().toISOString(),
		})
		.select("id")
		.single()

	if (error) {
		if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
			return { claimed: false, reason: "already_running" }
		}
		throw new Error(`Falha ao registrar a execução de ${opts.source}: ${error.message}`)
	}
	if (!data) throw new Error(`Falha ao registrar a execução de ${opts.source}: sem linha de retorno`)

	return { claimed: true, syncId: data.id as number }
}

/** Bate o heartbeat. Deve ser chamado DENTRO de etapa longa, não só entre etapas. */
export async function beatSync(supabase: Db, syncId: number): Promise<void> {
	await supabase.from(SYNC_LOG_TABLE).update({ heartbeat_at: new Date().toISOString() }).eq("id", syncId)
}

export interface FinishSyncOptions {
	status: "success" | "partial" | "error"
	completedSteps?: number
	successfulSteps?: number
	failedSteps?: number
	totalUpserted?: number
	errorMessage?: string | null
}

/**
 * Encerra a execução. Sair de `running` é o que libera a vaga no índice único — uma execução
 * que termina sem passar por aqui trava a origem até a recuperação por heartbeat.
 */
export async function finishSync(supabase: Db, syncId: number, opts: FinishSyncOptions): Promise<void> {
	await supabase
		.from(SYNC_LOG_TABLE)
		.update({
			status: opts.status,
			completed_steps: opts.completedSteps,
			successful_steps: opts.successfulSteps,
			failed_steps: opts.failedSteps,
			total_upserted: opts.totalUpserted,
			error_message: opts.errorMessage ?? null,
			finished_at: new Date().toISOString(),
		})
		.eq("id", syncId)
}

/** Última execução de uma origem — é o que cada painel consulta. */
export async function latestSync(supabase: Db, source: SyncSource, columns = "*") {
	const { data } = await supabase.from(SYNC_LOG_TABLE).select(columns).eq("source", source).order("started_at", { ascending: false }).limit(1).maybeSingle()
	return data
}
