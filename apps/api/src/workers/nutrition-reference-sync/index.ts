import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { beatSync, claimSync, hasLiveSync, recoverStaleSyncs, SYNC_SOURCES } from "../../lib/sync-log.ts"
import { importIbge } from "./importers/ibge.ts"
import { importTaco } from "./importers/taco.ts"
import { importUsda } from "./importers/usda.ts"

export type NutritionReferenceSyncTriggeredBy = "cron" | "manual" | "test"
type StepFn = (supabase: SupabaseClient<any, any>) => Promise<number>
type RunNutritionReferenceSyncOptions = { triggeredBy: NutritionReferenceSyncTriggeredBy; syncId?: number; maxSteps?: number }

type BlockedSource = { sourceId: string; versionLabel: string; upstreamUrl: string }

// Sources requiring a manually-obtained authorized file — never fetched automatically.
const BLOCKED_SOURCES: BlockedSource[] = [
	{ sourceId: "tbca", versionLabel: "manual-authorized-file", upstreamUrl: "https://www.tbca.net.br/" },
	{ sourceId: "tucunduva", versionLabel: "manual-authorized-file", upstreamUrl: "https://repositorio.usp.br/item/002302912" },
]

// Each step imports exactly ONE source and only ever touches that source's own rows.
const STEPS: Array<{ name: string; fn: StepFn }> = [
	{ name: "source.taco", fn: importTaco },
	{ name: "source.ibge_pof_2008_2009", fn: importIbge },
	{ name: "source.usda_fdc", fn: importUsda },
	...BLOCKED_SOURCES.map((source) => ({ name: `source.${source.sourceId}`, fn: (supabase: SupabaseClient<any, any>) => writeBlockedSource(supabase, source) })),
]
export const NUTRITION_REFERENCE_SYNC_TOTAL_STEPS = STEPS.length
export const NUTRITION_REFERENCE_SYNC_TEST_STEPS = 1

function getSupabase() {
	const supabaseUrl = process.env.API_SUPABASE_URL
	const serviceRoleKey = process.env.API_SUPABASE_SERVICE_ROLE_KEY
	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error("API_SUPABASE_URL and API_SUPABASE_SERVICE_ROLE_KEY are required for nutrition sync")
	}

	return createClient(supabaseUrl, serviceRoleKey, {
		db: { schema: "nutrition_reference" },
		auth: { persistSession: false },
	})
}

/**
 * Cliente do LOG. O log de execução é compartilhado por todas as integrações e mora em
 * `compras_gov_integration`, não no schema de dados desta sincronização.
 */
function getLogClient() {
	const supabaseUrl = process.env.API_SUPABASE_URL
	const serviceRoleKey = process.env.API_SUPABASE_SERVICE_ROLE_KEY
	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error("API_SUPABASE_URL and API_SUPABASE_SERVICE_ROLE_KEY are required for nutrition sync")
	}
	return createClient(supabaseUrl, serviceRoleKey, {
		db: { schema: "compras_gov_integration" },
		auth: { persistSession: false },
	})
}

function selectSteps(opts: Pick<RunNutritionReferenceSyncOptions, "triggeredBy" | "maxSteps">) {
	const defaultMaxSteps = opts.triggeredBy === "test" ? NUTRITION_REFERENCE_SYNC_TEST_STEPS : STEPS.length
	const maxSteps = Math.max(1, Math.min(opts.maxSteps ?? defaultMaxSteps, STEPS.length))
	return STEPS.slice(0, maxSteps)
}

export function getNutritionReferenceSyncTotalSteps(opts: Pick<RunNutritionReferenceSyncOptions, "triggeredBy" | "maxSteps">) {
	return selectSteps(opts).length
}

async function writeBlockedSource(supabase: SupabaseClient<any, any>, source: BlockedSource): Promise<number> {
	const { error } = await supabase.from("source_release").upsert(
		{
			source_id: source.sourceId,
			version_label: source.versionLabel,
			upstream_url: source.upstreamUrl,
			status: "blocked",
			fetched_at: new Date().toISOString(),
			metadata: { reason: "requires_authorized_file" },
		},
		{ onConflict: "source_id,version_label" }
	)
	if (error) throw new Error(error.message)
	return 0
}

/** Mantido para o painel e o teste da rota; delega ao controle compartilhado. */
export async function hasLiveNutritionSync(supabase: SupabaseClient<any, any>) {
	return hasLiveSync(supabase, SYNC_SOURCES.nutritionReference)
}

export async function runNutritionReferenceSync(opts: RunNutritionReferenceSyncOptions): Promise<number> {
	const supabase = getSupabase()
	const log = getLogClient()
	const steps = selectSteps(opts)

	let syncId = opts.syncId
	if (!syncId) {
		// A exclusão é do banco: `claimSync` compete pelo índice parcial único e a perdedora
		// recebe 23505, em vez de duas execuções passarem por um "verifica e insere".
		const claim = await claimSync(log, {
			source: SYNC_SOURCES.nutritionReference,
			triggeredBy: opts.triggeredBy === "cron" ? "cron" : "manual",
			totalSteps: steps.length,
		})
		if (!claim.claimed) {
			if (opts.triggeredBy === "cron") console.log("[nutrition-sync] Sync já em andamento. Saindo.")
			return -1
		}
		syncId = claim.syncId
	} else {
		await recoverStaleSyncs(log, SYNC_SOURCES.nutritionReference)
	}

	await beatSync(log, syncId)
	const { error: stepsErr } = await log
		.from("integration_sync_step")
		.insert(steps.map((step) => ({ sync_id: syncId, step_name: step.name, status: "pending" })))
	if (stepsErr) {
		await supabase
			.from("integration_sync_log")
			.update({ status: "error", error_message: stepsErr.message, finished_at: new Date().toISOString() })
			.eq("id", syncId)
		throw new Error(`Falha ao criar nutrition_sync_step: ${stepsErr.message}`)
	}

	for (const step of steps) {
		if (await isStopRequested(log, syncId)) {
			console.log(`[nutrition-sync] Stop solicitado — abortando antes do step ${step.name}`)
			await supabase
				.from("integration_sync_step")
				.update({ status: "error", error_message: "manually stopped", finished_at: new Date().toISOString() })
				.eq("sync_id", syncId)
				.eq("status", "pending")
			await supabase
				.from("integration_sync_log")
				.update({ status: "error", error_message: "Parada manualmente pelo usuário", finished_at: new Date().toISOString() })
				.eq("id", syncId)
			return syncId
		}
		await runStep(supabase, log, syncId, step.name, step.fn)
	}

	const { data: finalLog } = await log.from("integration_sync_log").select("successful_steps, failed_steps").eq("id", syncId).single()
	const failedSteps = finalLog?.failed_steps ?? 0
	const successfulSteps = finalLog?.successful_steps ?? 0
	const finalStatus = failedSteps === 0 ? "success" : successfulSteps > 0 ? "partial" : "error"
	await log.from("integration_sync_log").update({ status: finalStatus, finished_at: new Date().toISOString() }).eq("id", syncId)

	console.log(`[nutrition-sync] Sync #${syncId} concluída: ${finalStatus}`)
	return syncId
}

async function isStopRequested(log: SupabaseClient<any, any>, syncId: number) {
	const { data } = await log.from("integration_sync_log").select("stop_requested").eq("id", syncId).single()
	return Boolean(data?.stop_requested)
}

async function runStep(data: SupabaseClient<any, any>, log: SupabaseClient<any, any>, syncId: number, stepName: string, fn: StepFn) {
	const now = new Date().toISOString()
	await Promise.all([
		log.from("integration_sync_step").update({ status: "running", started_at: now }).eq("sync_id", syncId).eq("step_name", stepName),
		log.from("integration_sync_log").update({ heartbeat_at: now }).eq("id", syncId),
	])

	try {
		const upserted = await fn(data)
		await log
			.from("integration_sync_step")
			.update({ status: "success", finished_at: new Date().toISOString(), records_upserted: upserted })
			.eq("sync_id", syncId)
			.eq("step_name", stepName)
		await log.rpc("integration_sync_step_success", { p_sync_id: syncId, p_upserted: upserted })
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(`[nutrition-sync] Step '${stepName}' falhou: ${message}`)
		await log
			.from("integration_sync_step")
			.update({ status: "error", finished_at: new Date().toISOString(), error_message: message })
			.eq("sync_id", syncId)
			.eq("step_name", stepName)
		await log.rpc("integration_sync_step_failure", { p_sync_id: syncId })
	}
}

function nextTuesdayAt06UTC(): Date {
	const now = new Date()
	const next = new Date(now)
	const daysUntilTuesday = (2 - now.getUTCDay() + 7) % 7 || 7
	next.setUTCDate(now.getUTCDate() + daysUntilTuesday)
	next.setUTCHours(6, 0, 0, 0)
	return next
}

function scheduleNextRun() {
	const next = nextTuesdayAt06UTC()
	const delay = next.getTime() - Date.now()
	console.log(`[nutrition-sync] Próxima execução agendada: ${next.toISOString()}`)
	setTimeout(async () => {
		try {
			await runNutritionReferenceSync({ triggeredBy: "cron" })
		} catch (error) {
			console.error("[nutrition-sync] Erro não tratado no cron:", error)
		} finally {
			scheduleNextRun()
		}
	}, delay)
}

export async function startNutritionReferenceSyncWorker() {
	await recoverStaleSyncs(getLogClient(), SYNC_SOURCES.nutritionReference)
	scheduleNextRun()
	console.log("[nutrition-sync] Worker agendado (toda terça-feira 03:00 BRT)")
}
