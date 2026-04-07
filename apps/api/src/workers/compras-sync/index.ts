import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { env } from "../../env.ts"
import {
	syncMaterialCaracteristica,
	syncMaterialClasse,
	syncMaterialGrupo,
	syncMaterialItem,
	syncMaterialNaturezaDespesa,
	syncMaterialPdm,
	syncMaterialUnidadeFornecimento,
} from "./material.ts"
import {
	syncServicoClasse,
	syncServicoDivisao,
	syncServicoGrupo,
	syncServicoItem,
	syncServicoNaturezaDespesa,
	syncServicoSecao,
	syncServicoSubclasse,
	syncServicoUnidadeMedida,
} from "./servico.ts"

const TOTAL_STEPS = 15

// Heartbeat timeout: se não atualizar em 90s, o processo é considerado morto
const HEARTBEAT_TIMEOUT_MS = 90_000

type StepFn = (supabase: SupabaseClient<any, any>, updateProgress: (page: number, totalPages: number, upserted: number) => Promise<void>) => Promise<number>

/**
 * Cada wave é um array de steps executados em paralelo entre si.
 * As waves são executadas em sequência para respeitar dependências de FK.
 *
 * Hierarquia de dependências:
 *   material: grupo → classe → pdm → [natureza_despesa ‖ unid_fornecimento ‖ item] → caracteristica
 *   servico:  secao → divisao → grupo → classe → subclasse → item → [unid_medida ‖ natureza_despesa]
 *
 * Os módulos material e servico são independentes entre si e rodam em paralelo.
 * material.item usa busca de páginas em paralelo internamente (ITEM_PAGE_CONCURRENCY).
 */
const WAVES: Array<Array<{ name: string; fn: StepFn }>> = [
	// Wave 1 — raízes (sem dependências FK)
	[
		{ name: "material.grupo", fn: syncMaterialGrupo },
		{ name: "servico.secao", fn: syncServicoSecao },
	],
	// Wave 2 — classe depende de grupo
	[
		{ name: "material.classe", fn: syncMaterialClasse },
		{ name: "servico.divisao", fn: syncServicoDivisao },
	],
	// Wave 3 — pdm depende de classe; grupo_serv depende de divisao
	[
		{ name: "material.pdm", fn: syncMaterialPdm },
		{ name: "servico.grupo", fn: syncServicoGrupo },
	],
	// Wave 4 — natureza_despesa e unid_fornecimento dependem apenas de pdm
	//           classe_serv depende de grupo_serv
	//           (nenhum dos três depende entre si → rodam em paralelo)
	[
		{ name: "material.natureza_despesa", fn: syncMaterialNaturezaDespesa },
		{ name: "material.unidade_fornecimento", fn: syncMaterialUnidadeFornecimento },
		{ name: "servico.classe", fn: syncServicoClasse },
	],
	// Wave 5 — item (300K+ registros, busca de páginas em paralelo)
	//           subclasse depende de classe_serv
	[
		{ name: "material.item", fn: syncMaterialItem },
		{ name: "servico.subclasse", fn: syncServicoSubclasse },
	],
	// Wave 6 — caracteristica depende de item; servico.item depende de subclasse
	[
		{ name: "material.caracteristica", fn: syncMaterialCaracteristica },
		{ name: "servico.item", fn: syncServicoItem },
	],
	// Wave 7 — unid_medida e natureza_despesa_serv dependem de servico.item
	[
		{ name: "servico.unidade_medida", fn: syncServicoUnidadeMedida },
		{ name: "servico.natureza_despesa", fn: syncServicoNaturezaDespesa },
	],
]

export interface RunComprasSyncOptions {
	triggeredBy: "cron" | "manual"
}

// ── Heartbeat liveness check ──────────────────────────────────────────────────

export function isSyncLive(heartbeatAt: string | null, startedAt: string): boolean {
	const threshold = Date.now() - HEARTBEAT_TIMEOUT_MS
	// Recém criado (sem heartbeat ainda): usa started_at com margem de 15s
	if (!heartbeatAt) {
		return new Date(startedAt).getTime() > Date.now() - 15_000
	}
	return new Date(heartbeatAt).getTime() > threshold
}

// ── Recupera syncs presas por morte/restart de instância ──────────────────────

async function recoverStaleSyncs(supabase: SupabaseClient<any, any>): Promise<void> {
	const { data: stale, error } = await supabase.from("compras_sync_log").select("id, heartbeat_at, started_at").eq("status", "running")

	if (error || !stale?.length) return

	const dead = stale.filter((s) => !isSyncLive(s.heartbeat_at, s.started_at))
	if (!dead.length) return

	for (const log of dead) {
		console.warn(`[compras-sync] Recovery: sync #${log.id} sem heartbeat — marcando como error`)

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

	console.log(`[compras-sync] Recovery: ${dead.length} sync(s) morta(s) marcada(s) como error`)
}

// ── Concorrência: retorna true se já há uma sync viva rodando ─────────────────

export async function hasLiveSync(supabase: SupabaseClient<any, any>): Promise<boolean> {
	const { data, error } = await supabase.from("compras_sync_log").select("id, heartbeat_at, started_at").eq("status", "running")
	if (error || !data?.length) return false
	return data.some((s) => isSyncLive(s.heartbeat_at, s.started_at))
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runComprasSync(opts: RunComprasSyncOptions): Promise<number> {
	const supabase = createClient(env.API_SUPABASE_URL, env.API_SUPABASE_SERVICE_ROLE_KEY, {
		db: { schema: "sisub" },
		auth: { persistSession: false },
	})

	// Auto-recuperação: limpa syncs presas antes de verificar o lock.
	// Garante que um restart da API desbloqueie imediatamente qualquer sync morta,
	// mesmo em triggers manuais (não apenas no startup do worker).
	await recoverStaleSyncs(supabase)

	// ── Trava de concorrência (heartbeat-aware) ────────────────────────────────
	if (await hasLiveSync(supabase)) {
		if (opts.triggeredBy === "cron") {
			console.log("[compras-sync] Sync já em andamento. Saindo silenciosamente.")
		}
		return -1
	}

	// ── Criar log geral ────────────────────────────────────────────────────────
	const { data: logRow, error: logErr } = await supabase
		.from("compras_sync_log")
		.insert({ triggered_by: opts.triggeredBy, total_steps: TOTAL_STEPS })
		.select("id")
		.single()

	if (logErr || !logRow) {
		throw new Error(`Falha ao criar compras_sync_log: ${logErr?.message}`)
	}

	const syncId = logRow.id as number

	// Primeiro heartbeat imediato para que o lock funcione antes de qualquer step
	await supabase.from("compras_sync_log").update({ heartbeat_at: new Date().toISOString() }).eq("id", syncId)

	console.log(`[compras-sync] Iniciando sync #${syncId} (${opts.triggeredBy}) — ${WAVES.length} waves, ${TOTAL_STEPS} steps`)

	// ── Criar todos os step records como 'pending' ─────────────────────────────
	const allSteps = WAVES.flat()
	const { error: stepsErr } = await supabase.from("compras_sync_step").insert(allSteps.map((s) => ({ sync_id: syncId, step_name: s.name, status: "pending" })))

	if (stepsErr) {
		await supabase.from("compras_sync_log").update({ status: "error", error_message: stepsErr.message, finished_at: new Date().toISOString() }).eq("id", syncId)
		throw new Error(`Falha ao criar steps: ${stepsErr.message}`)
	}

	// ── Executar waves em sequência; steps de cada wave em paralelo ───────────
	for (let waveIdx = 0; waveIdx < WAVES.length; waveIdx++) {
		const wave = WAVES[waveIdx]

		// Verifica stop_requested antes de cada wave
		const { data: logState } = await supabase.from("compras_sync_log").select("stop_requested").eq("id", syncId).single()

		if (logState?.stop_requested) {
			console.log(`[compras-sync] Stop solicitado — abortando antes da wave ${waveIdx + 1}`)
			await supabase
				.from("compras_sync_step")
				.update({ status: "error", error_message: "manually stopped", finished_at: new Date().toISOString() })
				.eq("sync_id", syncId)
				.eq("status", "pending")
			await supabase
				.from("compras_sync_log")
				.update({ status: "error", error_message: "Parada manualmente pelo usuário", finished_at: new Date().toISOString() })
				.eq("id", syncId)
			return syncId
		}

		const stepNames = wave.map((s) => s.name).join(", ")
		console.log(`[compras-sync] Wave ${waveIdx + 1}/${WAVES.length}: [${stepNames}]`)

		// runStep nunca lança (captura internamente) — Promise.all sempre resolve
		await Promise.all(wave.map((step) => runStep(supabase, syncId, step.name, step.fn)))
	}

	// ── Finalizar log geral ────────────────────────────────────────────────────
	const { data: finalLog } = await supabase.from("compras_sync_log").select("successful_steps, failed_steps").eq("id", syncId).single()

	const failedSteps = finalLog?.failed_steps ?? 0
	const successfulSteps = finalLog?.successful_steps ?? 0
	const finalStatus = failedSteps === 0 ? "success" : successfulSteps > 0 ? "partial" : "error"

	await supabase.from("compras_sync_log").update({ status: finalStatus, finished_at: new Date().toISOString() }).eq("id", syncId)

	console.log(`[compras-sync] Sync #${syncId} concluída: ${finalStatus} (${successfulSteps}/${TOTAL_STEPS} steps com sucesso)`)

	return syncId
}

// ── Step runner ───────────────────────────────────────────────────────────────

async function runStep(supabase: SupabaseClient<any, any>, syncId: number, stepName: string, fn: StepFn): Promise<void> {
	console.log(`[compras-sync] Step '${stepName}' iniciando...`)

	const now = new Date().toISOString()
	await Promise.all([
		supabase.from("compras_sync_step").update({ status: "running", started_at: now }).eq("sync_id", syncId).eq("step_name", stepName),
		// Heartbeat no início de cada step — múltiplos steps paralelos atualizam
		// a mesma linha; o último writer vence mas qualquer um mantém o lock vivo
		supabase.from("compras_sync_log").update({ heartbeat_at: now }).eq("id", syncId),
	])

	const updateProgress = async (page: number, totalPages: number, upserted: number) => {
		const ts = new Date().toISOString()
		await Promise.all([
			supabase
				.from("compras_sync_step")
				.update({ current_page: page, total_pages: totalPages, records_upserted: upserted })
				.eq("sync_id", syncId)
				.eq("step_name", stepName),
			// Heartbeat por página — mantém o lock vivo durante processamento longo
			supabase.from("compras_sync_log").update({ heartbeat_at: ts }).eq("id", syncId),
		])
	}

	try {
		const upserted = await fn(supabase, updateProgress)

		await supabase
			.from("compras_sync_step")
			.update({ status: "success", finished_at: new Date().toISOString(), records_upserted: upserted })
			.eq("sync_id", syncId)
			.eq("step_name", stepName)

		await supabase.rpc("compras_sync_step_success", { p_sync_id: syncId, p_upserted: upserted })

		console.log(`[compras-sync] Step '${stepName}' concluído: ${upserted} registros`)
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		console.error(`[compras-sync] Step '${stepName}' falhou:`, message)

		await supabase
			.from("compras_sync_step")
			.update({ status: "error", finished_at: new Date().toISOString(), error_message: message })
			.eq("sync_id", syncId)
			.eq("step_name", stepName)

		await supabase.rpc("compras_sync_step_failure", { p_sync_id: syncId })
	}
}

// ── Agendamento cron: toda segunda-feira às 03:00 BRT (06:00 UTC) ─────────────

function nextMondayAt06UTC(): Date {
	const now = new Date()
	const next = new Date(now)
	const daysUntilMonday = (1 - now.getUTCDay() + 7) % 7 || 7
	next.setUTCDate(now.getUTCDate() + daysUntilMonday)
	next.setUTCHours(6, 0, 0, 0)
	return next
}

function scheduleNextRun() {
	const next = nextMondayAt06UTC()
	const delay = next.getTime() - Date.now()
	console.log(`[compras-sync] Próxima execução agendada: ${next.toISOString()}`)
	setTimeout(async () => {
		try {
			await runComprasSync({ triggeredBy: "cron" })
		} catch (err) {
			console.error("[compras-sync] Erro não tratado no cron:", err)
		} finally {
			scheduleNextRun()
		}
	}, delay)
}

export async function startComprasSyncWorker() {
	const supabase = createClient(env.API_SUPABASE_URL, env.API_SUPABASE_SERVICE_ROLE_KEY, {
		db: { schema: "sisub" },
		auth: { persistSession: false },
	})

	// Recupera syncs presas de instâncias anteriores (belt-and-suspenders;
	// runComprasSync também chama isso, mas aqui garante limpeza antes do schedule)
	await recoverStaleSyncs(supabase)

	scheduleNextRun()
	console.log("[compras-sync] Worker agendado (toda segunda-feira 03:00 BRT)")
}
