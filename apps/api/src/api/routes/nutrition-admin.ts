import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { createClient } from "@supabase/supabase-js"
import { secureCompare } from "../../lib/secure-compare.ts"
import {
	getNutritionReferenceSyncTotalSteps,
	hasLiveNutritionSync,
	NUTRITION_REFERENCE_SYNC_TOTAL_STEPS,
	type NutritionReferenceSyncTriggeredBy,
	runNutritionReferenceSync,
} from "../../workers/nutrition-reference-sync/index.ts"

type NutritionSyncClient = ReturnType<typeof getSupabase>

function requiredEnv(name: "API_SUPABASE_URL" | "API_SUPABASE_SERVICE_ROLE_KEY" | "ADMIN_SECRET") {
	const value = process.env[name]
	if (!value) throw new Error(`${name} is required`)
	return value
}

function getSupabase() {
	return createClient(requiredEnv("API_SUPABASE_URL"), requiredEnv("API_SUPABASE_SERVICE_ROLE_KEY"), {
		db: { schema: "nutrition_reference" },
		auth: { persistSession: false },
	})
}

const ErrorSchema = z.object({ error: z.string() })

const TriggerSyncRequestSchema = z
	.object({
		triggered_by: z.enum(["test", "manual", "cron"]).optional(),
		test_run: z.boolean().optional(),
		max_steps: z.number().int().min(1).max(NUTRITION_REFERENCE_SYNC_TOTAL_STEPS).optional(),
	})
	.optional()

const SyncStepSchema = z.object({
	id: z.number(),
	sync_id: z.number(),
	step_name: z.string(),
	status: z.enum(["pending", "running", "success", "error"]),
	current_page: z.number(),
	total_pages: z.number().nullable(),
	records_upserted: z.number(),
	records_deactivated: z.number(),
	error_message: z.string().nullable(),
	started_at: z.string().nullable(),
	finished_at: z.string().nullable(),
})

const SyncLogSchema = z.object({
	id: z.number(),
	started_at: z.string(),
	finished_at: z.string().nullable(),
	triggered_by: z.string(),
	status: z.enum(["running", "success", "partial", "error"]),
	total_steps: z.number(),
	completed_steps: z.number(),
	successful_steps: z.number(),
	failed_steps: z.number(),
	total_upserted: z.number(),
	total_deactivated: z.number(),
	error_message: z.string().nullable(),
	steps: z.array(SyncStepSchema),
})

const adminSecurity = [{ AdminSecret: [] }]

const triggerSyncRoute = createRoute({
	method: "post",
	path: "/sync",
	tags: ["Admin — Nutrition Sync"],
	summary: "Trigger nutrition reference sync",
	description: "Starts a nutrition reference sync job in background. Use test_run=true for a limited production test run.",
	security: adminSecurity,
	request: {
		body: {
			content: {
				"application/json": {
					schema: TriggerSyncRequestSchema,
				},
			},
			required: false,
		},
	},
	responses: {
		202: {
			content: { "application/json": { schema: z.object({ sync_id: z.number().nullable(), message: z.string() }) } },
			description: "Sync started in background",
		},
		409: { content: { "application/json": { schema: ErrorSchema } }, description: "Sync already running" },
		401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
	},
})

const getSyncLatestRoute = createRoute({
	method: "get",
	path: "/sync/latest",
	tags: ["Admin — Nutrition Sync"],
	summary: "Get latest nutrition sync log",
	security: adminSecurity,
	responses: {
		200: { content: { "application/json": { schema: SyncLogSchema } }, description: "Latest sync log with steps" },
		404: { content: { "application/json": { schema: ErrorSchema } }, description: "No sync found" },
		401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
	},
})

const getSyncByIdRoute = createRoute({
	method: "get",
	path: "/sync/{id}",
	tags: ["Admin — Nutrition Sync"],
	summary: "Get nutrition sync log by ID",
	security: adminSecurity,
	request: { params: z.object({ id: z.coerce.number().int().positive() }) },
	responses: {
		200: { content: { "application/json": { schema: SyncLogSchema } }, description: "Sync log with steps" },
		400: { content: { "application/json": { schema: ErrorSchema } }, description: "Invalid ID" },
		404: { content: { "application/json": { schema: ErrorSchema } }, description: "Sync not found" },
		401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
	},
})

const stopSyncRoute = createRoute({
	method: "post",
	path: "/sync/{id}/stop",
	tags: ["Admin — Nutrition Sync"],
	summary: "Request nutrition sync cancellation",
	description: "Sets stop_requested flag. Cancellation is applied before the next step.",
	security: adminSecurity,
	request: { params: z.object({ id: z.coerce.number().int().positive() }) },
	responses: {
		200: { content: { "application/json": { schema: z.object({ message: z.string() }) } }, description: "Stop requested" },
		404: { content: { "application/json": { schema: ErrorSchema } }, description: "Sync not found" },
		409: { content: { "application/json": { schema: ErrorSchema } }, description: "Sync not running" },
		401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
	},
})

export interface NutritionAdminRoutesDeps {
	adminSecret?: string
	getSupabase?: () => NutritionSyncClient
	hasLiveSync?: (supabase: NutritionSyncClient) => Promise<boolean>
	runSync?: (options: { triggeredBy: NutritionReferenceSyncTriggeredBy; syncId: number; maxSteps?: number }) => Promise<number>
}

export function createNutritionAdminRoutes(deps: NutritionAdminRoutesDeps = {}) {
	const nutritionAdminRoutes = new OpenAPIHono()
	const adminSecret = deps.adminSecret ?? process.env.ADMIN_SECRET
	const createSupabase = deps.getSupabase ?? getSupabase
	const isLive = deps.hasLiveSync ?? hasLiveNutritionSync
	const sync = deps.runSync ?? runNutritionReferenceSync

	nutritionAdminRoutes.use("*", async (c, next) => {
		const secret = c.req.header("x-admin-secret")
		if (!secureCompare(secret, adminSecret)) return c.json({ error: "Unauthorized" }, 401)
		return next()
	})

	nutritionAdminRoutes
		.openapi(triggerSyncRoute, async (c) => {
			const body = await c.req.json().catch(() => undefined)
			const input = TriggerSyncRequestSchema.parse(body)
			const triggeredBy = (input?.test_run ? "test" : (input?.triggered_by ?? "manual")) as NutritionReferenceSyncTriggeredBy
			const maxSteps = input?.max_steps
			const totalSteps = getNutritionReferenceSyncTotalSteps({ triggeredBy, maxSteps })
			const supabase = createSupabase()

			if (await isLive(supabase)) return c.json({ error: "Sync já está em andamento" }, 409)

			const { data: logRow, error: logErr } = await supabase
				.from("nutrition_sync_log")
				.insert({ triggered_by: triggeredBy, total_steps: totalSteps })
				.select("id")
				.single()
			if (logErr || !logRow) throw new Error(`Falha ao criar nutrition_sync_log: ${logErr?.message}`)

			const syncId = Number(logRow.id)
			sync({ triggeredBy, syncId, maxSteps })
				.then((syncId) => console.log(`[nutrition-admin] Sync ${triggeredBy} #${syncId} concluída`))
				.catch(async (err) => {
					const message = err instanceof Error ? err.message : String(err)
					await supabase.from("nutrition_sync_log").update({ status: "error", error_message: message, finished_at: new Date().toISOString() }).eq("id", syncId)
					console.error(`[nutrition-admin] Sync ${triggeredBy} falhou:`, err)
				})

			return c.json({ sync_id: syncId, message: "Sync iniciada em background" }, 202)
		})
		.openapi(getSyncLatestRoute, async (c) => {
			const supabase = createSupabase()
			const { data: log, error } = await supabase.from("nutrition_sync_log").select("*").order("started_at", { ascending: false }).limit(1).single()
			if (error || !log) return c.json({ error: "Nenhuma sync encontrada" }, 404)

			const { data: steps } = await supabase.from("nutrition_sync_step").select("*").eq("sync_id", log.id).order("id", { ascending: true })
			return c.json(SyncLogSchema.parse({ ...log, steps: steps ?? [] }), 200)
		})
		.openapi(getSyncByIdRoute, async (c) => {
			const { id } = c.req.valid("param")
			const supabase = createSupabase()
			const { data: log, error } = await supabase.from("nutrition_sync_log").select("*").eq("id", id).single()
			if (error || !log) return c.json({ error: "Sync não encontrada" }, 404)

			const { data: steps } = await supabase.from("nutrition_sync_step").select("*").eq("sync_id", id).order("id", { ascending: true })
			return c.json(SyncLogSchema.parse({ ...log, steps: steps ?? [] }), 200)
		})
		.openapi(stopSyncRoute, async (c) => {
			const { id } = c.req.valid("param")
			const supabase = createSupabase()
			const { data: log, error } = await supabase.from("nutrition_sync_log").select("id, status").eq("id", id).single()
			if (error || !log) return c.json({ error: "Sync não encontrada" }, 404)
			if (log.status !== "running") return c.json({ error: "Sync não está em andamento" }, 409)

			await supabase.from("nutrition_sync_log").update({ stop_requested: true }).eq("id", id)
			console.log(`[nutrition-admin] Stop solicitado para sync #${id}`)
			return c.json({ message: "Parada solicitada" }, 200)
		})

	return nutritionAdminRoutes
}

export const nutritionAdminRoutes = createNutritionAdminRoutes()
