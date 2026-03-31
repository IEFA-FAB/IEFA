import { createClient } from "@supabase/supabase-js"
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

type StepFn = (
	supabase: ReturnType<typeof createClient>,
	updateProgress: (page: number, totalPages: number, upserted: number) => Promise<void>
) => Promise<number>

const STEPS: Array<{ name: string; fn: StepFn }> = [
	{ name: "material.grupo", fn: syncMaterialGrupo },
	{ name: "material.classe", fn: syncMaterialClasse },
	{ name: "material.pdm", fn: syncMaterialPdm },
	{ name: "material.item", fn: syncMaterialItem },
	{ name: "material.natureza_despesa", fn: syncMaterialNaturezaDespesa },
	{ name: "material.unidade_fornecimento", fn: syncMaterialUnidadeFornecimento },
	{ name: "material.caracteristica", fn: syncMaterialCaracteristica },
	{ name: "servico.secao", fn: syncServicoSecao },
	{ name: "servico.divisao", fn: syncServicoDivisao },
	{ name: "servico.grupo", fn: syncServicoGrupo },
	{ name: "servico.classe", fn: syncServicoClasse },
	{ name: "servico.subclasse", fn: syncServicoSubclasse },
	{ name: "servico.item", fn: syncServicoItem },
	{ name: "servico.unidade_medida", fn: syncServicoUnidadeMedida },
	{ name: "servico.natureza_despesa", fn: syncServicoNaturezaDespesa },
]

export interface RunComprasSyncOptions {
	triggeredBy: "cron" | "manual"
}

// ── Verifica se um sync running está realmente vivo (heartbeat recente) ────────

export function isSyncLive(heartbeatAt: string | null, startedAt: string): boolean {
	const threshold = Date.now() - HEARTBEAT_TIMEOUT_MS
	// Recém criado (sem heartbeat ainda): usa started_at com margem de 15s
	if (!heartbeatAt) {
		return new Date(startedAt).getTime() > Date.now() - 15_000
	}
	return new Date(heartbeatAt).getTime() > threshold
}

// ── Recupera syncs presas por morte de instância ───────────────────────────────

async function recoverStaleSyncs(supabase: ReturnType<typeof createClient>): Promise<void> {
	// Busca syncs running com heartbeat velho OU sem heartbeat mas started_at antigo
	const { data: stale, error } = await supabase.from("compras_sync_log").select("id, heartbeat_at, started_at").eq("status", "running")

	if (error || !stale?.length) return

	const dead = stale.filter((s) => !isSyncLive(s.heartbeat_at, s.started_at))
	if (!dead.length) return

	for (const log of dead) {
		console.warn(`[compras-sync] Recovery: sync #${log.id} sem heartbeat — marcando como error`)

		await supabase
			.from("compras_sync_step")
			.update({
				status: "error",
				error_message: "instance_died",
				finished_at: new Date().toISOString(),
			})
			.eq("sync_id", log.id)
			.in("status", ["running", "pending"])

		await supabase
			.from("compras_sync_log")
			.update({
				status: "error",
				error_message: "API instance died or restarted mid-sync",
				finished_at: new Date().toISOString(),
			})
			.eq("id", log.id)
	}

	console.log(`[compras-sync] Recovery: ${dead.length} sync(s) morta(s) marcada(s) como error`)
}

// ── Concorrência: retorna true se já há uma sync viva rodando ─────────────────

export async function hasLiveSync(supabase: ReturnType<typeof createClient>): Promise<boolean> {
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
		console.error("[compras-sync] Falha ao criar compras_sync_log:", logErr?.message)
		throw new Error(`Falha ao criar compras_sync_log: ${logErr?.message}`)
	}

	const syncId = logRow.id as number

	// Primeiro heartbeat imediato para garantir que o lock funcione
	await supabase.from("compras_sync_log").update({ heartbeat_at: new Date().toISOString() }).eq("id", syncId)

	console.log(`[compras-sync] Iniciando sync #${syncId} (${opts.triggeredBy})`)

	// ── Criar todos os step records como 'pending' ─────────────────────────────
	const stepRows = STEPS.map((s) => ({
		sync_id: syncId,
		step_name: s.name,
		status: "pending",
	}))
	const { error: stepsErr } = await supabase.from("compras_sync_step").insert(stepRows)
	if (stepsErr) {
		await supabase.from("compras_sync_log").update({ status: "error", error_message: stepsErr.message, finished_at: new Date().toISOString() }).eq("id", syncId)
		throw new Error(`Falha ao criar steps: ${stepsErr.message}`)
	}

	// ── Executar cada step, checando stop_requested entre eles ────────────────
	for (const step of STEPS) {
		// Verifica flag de parada antes de cada step
		const { data: logState } = await supabase.from("compras_sync_log").select("stop_requested").eq("id", syncId).single()

		if (logState?.stop_requested) {
			console.log(`[compras-sync] Stop solicitado — abortando antes de '${step.name}'`)
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

		await runStep(supabase, syncId, step.name, step.fn)
	}

	// ── Finalizar log geral ────────────────────────────────────────────────────
	const { data: finalLog } = await supabase.from("compras_sync_log").select("successful_steps, failed_steps, stop_requested").eq("id", syncId).single()

	// Se stop foi solicitado no último step, já foi tratado acima; mas caso o
	// step tenha completado antes do check, finalizamos normalmente
	const failedSteps = finalLog?.failed_steps ?? 0
	const successfulSteps = finalLog?.successful_steps ?? 0
	let finalStatus: string
	if (failedSteps === 0) {
		finalStatus = "success"
	} else if (successfulSteps > 0) {
		finalStatus = "partial"
	} else {
		finalStatus = "error"
	}

	await supabase.from("compras_sync_log").update({ status: finalStatus, finished_at: new Date().toISOString() }).eq("id", syncId)

	console.log(`[compras-sync] Sync #${syncId} concluída: ${finalStatus} ` + `(${successfulSteps}/${TOTAL_STEPS} steps com sucesso)`)

	return syncId
}

async function runStep(supabase: ReturnType<typeof createClient>, syncId: number, stepName: string, fn: StepFn): Promise<void> {
	console.log(`[compras-sync] Step '${stepName}' iniciando...`)

	const now = new Date().toISOString()
	await Promise.all([
		supabase.from("compras_sync_step").update({ status: "running", started_at: now }).eq("sync_id", syncId).eq("step_name", stepName),
		// Heartbeat no início de cada step — garante liveness mesmo em steps lentos
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

	// Recupera syncs presas de instâncias mortas antes de qualquer coisa
	await recoverStaleSyncs(supabase)

	scheduleNextRun()
	console.log("[compras-sync] Worker agendado (toda segunda-feira 03:00 BRT)")
}
