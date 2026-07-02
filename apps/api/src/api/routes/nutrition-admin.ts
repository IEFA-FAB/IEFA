import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { createClient } from "@supabase/supabase-js"
import { env } from "../../env.ts"
import { hasLiveNutritionSync, runNutritionReferenceSync } from "../../workers/nutrition-reference-sync/index.ts"

function getSupabase() {
	return createClient(env.API_SUPABASE_URL, env.API_SUPABASE_SERVICE_ROLE_KEY, {
		db: { schema: "nutrition_reference" },
		auth: { persistSession: false },
	})
}

const ErrorSchema = z.object({ error: z.string() })

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
	summary: "Trigger manual nutrition reference sync",
	description: "Starts a new nutrition reference sync job in background. Returns 409 if a sync is already running.",
	security: adminSecurity,
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

export const nutritionAdminRoutes = new OpenAPIHono()

nutritionAdminRoutes.use("*", async (c, next) => {
	const secret = c.req.header("x-admin-secret")
	if (!secret || secret !== env.ADMIN_SECRET) return c.json({ error: "Unauthorized" }, 401)
	return next()
})

nutritionAdminRoutes
	.openapi(triggerSyncRoute, async (c) => {
		const supabase = getSupabase()
		if (await hasLiveNutritionSync(supabase)) return c.json({ error: "Sync já está em andamento" }, 409)

		runNutritionReferenceSync({ triggeredBy: "manual" })
			.then((syncId) => console.log(`[nutrition-admin] Sync manual #${syncId} concluída`))
			.catch((err) => console.error("[nutrition-admin] Sync manual falhou:", err))

		await new Promise((resolve) => setTimeout(resolve, 200))

		const { data: latest } = await supabase
			.from("nutrition_sync_log")
			.select("id")
			.eq("triggered_by", "manual")
			.order("started_at", { ascending: false })
			.limit(1)
			.single()

		return c.json({ sync_id: latest?.id ?? null, message: "Sync iniciada em background" }, 202)
	})
	.openapi(getSyncLatestRoute, async (c) => {
		const supabase = getSupabase()
		const { data: log, error } = await supabase.from("nutrition_sync_log").select("*").order("started_at", { ascending: false }).limit(1).single()
		if (error || !log) return c.json({ error: "Nenhuma sync encontrada" }, 404)

		const { data: steps } = await supabase.from("nutrition_sync_step").select("*").eq("sync_id", log.id).order("id", { ascending: true })
		return c.json(SyncLogSchema.parse({ ...log, steps: steps ?? [] }), 200)
	})
	.openapi(getSyncByIdRoute, async (c) => {
		const { id } = c.req.valid("param")
		const supabase = getSupabase()
		const { data: log, error } = await supabase.from("nutrition_sync_log").select("*").eq("id", id).single()
		if (error || !log) return c.json({ error: "Sync não encontrada" }, 404)

		const { data: steps } = await supabase.from("nutrition_sync_step").select("*").eq("sync_id", id).order("id", { ascending: true })
		return c.json(SyncLogSchema.parse({ ...log, steps: steps ?? [] }), 200)
	})
	.openapi(stopSyncRoute, async (c) => {
		const { id } = c.req.valid("param")
		const supabase = getSupabase()
		const { data: log, error } = await supabase.from("nutrition_sync_log").select("id, status").eq("id", id).single()
		if (error || !log) return c.json({ error: "Sync não encontrada" }, 404)
		if (log.status !== "running") return c.json({ error: "Sync não está em andamento" }, 409)

		await supabase.from("nutrition_sync_log").update({ stop_requested: true }).eq("id", id)
		console.log(`[nutrition-admin] Stop solicitado para sync #${id}`)
		return c.json({ message: "Parada solicitada" }, 200)
	})
