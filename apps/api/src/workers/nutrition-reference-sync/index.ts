import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { env } from "../../env.ts"

const HEARTBEAT_TIMEOUT_MS = 90_000
const HEADER_FETCH_TIMEOUT_MS = 10_000

type TriggeredBy = "cron" | "manual"
type StepFn = (supabase: SupabaseClient<any, any>) => Promise<number>
type RunNutritionReferenceSyncOptions = { triggeredBy: TriggeredBy; syncId?: number }

type SourceCheck = {
	sourceId: string
	versionLabel: string
	upstreamUrl: string
	downloadUrl?: string
	status?: "active" | "blocked"
}

const SOURCE_CHECKS: SourceCheck[] = [
	{
		sourceId: "taco",
		versionLabel: "4a edicao 2011",
		upstreamUrl: "https://nepa.unicamp.br/publicacoes/tabela-taco-excel/",
		downloadUrl: "https://nepa.unicamp.br/publicacoes/tabela-taco-excel/",
	},
	{
		sourceId: "ibge_pof_2008_2009",
		versionLabel: "POF 2008-2009",
		upstreamUrl: "https://biblioteca.ibge.gov.br/index.php/biblioteca-catalogo?id=250002&view=detalhes",
		downloadUrl: "https://biblioteca.ibge.gov.br/index.php/biblioteca-catalogo?id=250002&view=detalhes",
	},
	{
		sourceId: "usda_fdc",
		versionLabel: "latest",
		upstreamUrl: "https://fdc.nal.usda.gov/download-datasets",
		downloadUrl: "https://fdc.nal.usda.gov/download-datasets",
	},
	{
		sourceId: "tbca",
		versionLabel: "manual-authorized-file",
		upstreamUrl: "https://www.tbca.net.br/",
		status: "blocked",
	},
	{
		sourceId: "tucunduva",
		versionLabel: "manual-authorized-file",
		upstreamUrl: "https://repositorio.usp.br/item/002302912",
		status: "blocked",
	},
]

const STEPS: Array<{ name: string; fn: StepFn }> = SOURCE_CHECKS.map((source) => ({
	name: `source.${source.sourceId}`,
	fn: (supabase) => checkSourceRelease(supabase, source),
}))
export const NUTRITION_REFERENCE_SYNC_TOTAL_STEPS = STEPS.length

function getSupabase() {
	return createClient(env.API_SUPABASE_URL, env.API_SUPABASE_SERVICE_ROLE_KEY, {
		db: { schema: "nutrition_reference" },
		auth: { persistSession: false },
	})
}

export function isNutritionSyncLive(heartbeatAt: string | null, startedAt: string): boolean {
	const threshold = Date.now() - HEARTBEAT_TIMEOUT_MS
	if (!heartbeatAt) return new Date(startedAt).getTime() > Date.now() - 15_000
	return new Date(heartbeatAt).getTime() > threshold
}

async function recoverStaleSyncs(supabase: SupabaseClient<any, any>) {
	const { data: stale, error } = await supabase.from("nutrition_sync_log").select("id, heartbeat_at, started_at").eq("status", "running")
	if (error || !stale?.length) return

	const dead = stale.filter((sync) => !isNutritionSyncLive(sync.heartbeat_at, sync.started_at))
	for (const log of dead) {
		console.warn(`[nutrition-sync] Recovery: sync #${log.id} sem heartbeat`)
		await supabase
			.from("nutrition_sync_step")
			.update({ status: "error", error_message: "instance_died", finished_at: new Date().toISOString() })
			.eq("sync_id", log.id)
			.in("status", ["running", "pending"])
		await supabase
			.from("nutrition_sync_log")
			.update({ status: "error", error_message: "API instance died or restarted mid-sync", finished_at: new Date().toISOString() })
			.eq("id", log.id)
	}
}

export async function hasLiveNutritionSync(supabase: SupabaseClient<any, any>) {
	const { data, error } = await supabase.from("nutrition_sync_log").select("id, heartbeat_at, started_at").eq("status", "running")
	if (error || !data?.length) return false
	return data.some((sync) => isNutritionSyncLive(sync.heartbeat_at, sync.started_at))
}

async function fetchWithTimeout(url: string, init: RequestInit) {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), HEADER_FETCH_TIMEOUT_MS)
	try {
		return await fetch(url, { ...init, signal: controller.signal })
	} finally {
		clearTimeout(timeout)
	}
}

async function fetchHeaders(url: string) {
	try {
		const head = await fetchWithTimeout(url, { method: "HEAD" })
		if (head.ok) {
			return {
				etag: head.headers.get("etag"),
				lastModified: head.headers.get("last-modified"),
				statusCode: head.status,
			}
		}
	} catch {
		// Some institutional pages reject HEAD; GET below records reachability.
	}

	const res = await fetchWithTimeout(url, { method: "GET" })
	const headers = {
		etag: res.headers.get("etag"),
		lastModified: res.headers.get("last-modified"),
		statusCode: res.status,
	}
	const cancelBody = res.body?.cancel()
	if (cancelBody) await cancelBody.catch(() => undefined)
	return headers
}

async function checkSourceRelease(supabase: SupabaseClient<any, any>, source: SourceCheck): Promise<number> {
	const now = new Date().toISOString()

	if (source.status === "blocked") {
		const { error } = await supabase.from("source_release").upsert(
			{
				source_id: source.sourceId,
				version_label: source.versionLabel,
				upstream_url: source.upstreamUrl,
				download_url: source.downloadUrl ?? null,
				status: "blocked",
				fetched_at: now,
				metadata: { reason: "requires_authorized_file" },
			},
			{ onConflict: "source_id,version_label" }
		)
		if (error) throw new Error(error.message)
		return 1
	}

	const headers = await fetchHeaders(source.downloadUrl ?? source.upstreamUrl)
	const { error } = await supabase.from("source_release").upsert(
		{
			source_id: source.sourceId,
			version_label: source.versionLabel,
			upstream_url: source.upstreamUrl,
			download_url: source.downloadUrl ?? null,
			etag: headers.etag,
			last_modified: headers.lastModified,
			status: headers.statusCode >= 200 && headers.statusCode < 400 ? "active" : "failed",
			fetched_at: now,
			metadata: { http_status: headers.statusCode },
		},
		{ onConflict: "source_id,version_label" }
	)
	if (error) throw new Error(error.message)
	return 1
}

export async function runNutritionReferenceSync(opts: RunNutritionReferenceSyncOptions): Promise<number> {
	const supabase = getSupabase()
	await recoverStaleSyncs(supabase)

	if (!opts.syncId && (await hasLiveNutritionSync(supabase))) {
		if (opts.triggeredBy === "cron") console.log("[nutrition-sync] Sync já em andamento. Saindo.")
		return -1
	}

	let syncId = opts.syncId
	if (!syncId) {
		const { data: logRow, error: logErr } = await supabase
			.from("nutrition_sync_log")
			.insert({ triggered_by: opts.triggeredBy, total_steps: STEPS.length })
			.select("id")
			.single()
		if (logErr || !logRow) throw new Error(`Falha ao criar nutrition_sync_log: ${logErr?.message}`)
		syncId = Number(logRow.id)
	}

	await supabase.from("nutrition_sync_log").update({ heartbeat_at: new Date().toISOString() }).eq("id", syncId)
	const { error: stepsErr } = await supabase
		.from("nutrition_sync_step")
		.insert(STEPS.map((step) => ({ sync_id: syncId, step_name: step.name, status: "pending" })))
	if (stepsErr) {
		await supabase
			.from("nutrition_sync_log")
			.update({ status: "error", error_message: stepsErr.message, finished_at: new Date().toISOString() })
			.eq("id", syncId)
		throw new Error(`Falha ao criar nutrition_sync_step: ${stepsErr.message}`)
	}

	for (const step of STEPS) {
		if (await isStopRequested(supabase, syncId)) {
			console.log(`[nutrition-sync] Stop solicitado — abortando antes do step ${step.name}`)
			await supabase
				.from("nutrition_sync_step")
				.update({ status: "error", error_message: "manually stopped", finished_at: new Date().toISOString() })
				.eq("sync_id", syncId)
				.eq("status", "pending")
			await supabase
				.from("nutrition_sync_log")
				.update({ status: "error", error_message: "Parada manualmente pelo usuário", finished_at: new Date().toISOString() })
				.eq("id", syncId)
			return syncId
		}
		await runStep(supabase, syncId, step.name, step.fn)
	}

	const { data: finalLog } = await supabase.from("nutrition_sync_log").select("successful_steps, failed_steps").eq("id", syncId).single()
	const failedSteps = finalLog?.failed_steps ?? 0
	const successfulSteps = finalLog?.successful_steps ?? 0
	const finalStatus = failedSteps === 0 ? "success" : successfulSteps > 0 ? "partial" : "error"
	await supabase.from("nutrition_sync_log").update({ status: finalStatus, finished_at: new Date().toISOString() }).eq("id", syncId)

	console.log(`[nutrition-sync] Sync #${syncId} concluída: ${finalStatus}`)
	return syncId
}

async function isStopRequested(supabase: SupabaseClient<any, any>, syncId: number) {
	const { data } = await supabase.from("nutrition_sync_log").select("stop_requested").eq("id", syncId).single()
	return Boolean(data?.stop_requested)
}

async function runStep(supabase: SupabaseClient<any, any>, syncId: number, stepName: string, fn: StepFn) {
	const now = new Date().toISOString()
	await Promise.all([
		supabase.from("nutrition_sync_step").update({ status: "running", started_at: now }).eq("sync_id", syncId).eq("step_name", stepName),
		supabase.from("nutrition_sync_log").update({ heartbeat_at: now }).eq("id", syncId),
	])

	try {
		const upserted = await fn(supabase)
		await supabase
			.from("nutrition_sync_step")
			.update({ status: "success", finished_at: new Date().toISOString(), records_upserted: upserted })
			.eq("sync_id", syncId)
			.eq("step_name", stepName)
		await supabase.rpc("nutrition_sync_step_success", { p_sync_id: syncId, p_upserted: upserted })
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error(`[nutrition-sync] Step '${stepName}' falhou: ${message}`)
		await supabase
			.from("nutrition_sync_step")
			.update({ status: "error", finished_at: new Date().toISOString(), error_message: message })
			.eq("sync_id", syncId)
			.eq("step_name", stepName)
		await supabase.rpc("nutrition_sync_step_failure", { p_sync_id: syncId })
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
	const supabase = getSupabase()
	await recoverStaleSyncs(supabase)
	scheduleNextRun()
	console.log("[nutrition-sync] Worker agendado (toda terça-feira 03:00 BRT)")
}
