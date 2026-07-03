import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { type NutritionSyncOptions, type NutritionSyncSummary, runNutritionSync } from "../../workers/nutrition-sync/index.ts"

const ErrorSchema = z.object({ error: z.string(), details: z.string().optional() })

const NutritionSyncRequestSchema = z
	.object({
		dry_run: z.boolean().optional(),
		batch_size: z.number().int().min(1).max(1_000).optional(),
		triggered_by: z.enum(["test", "manual", "cron"]).optional(),
		test_run: z.boolean().optional(),
		max_nutrients: z.number().int().min(1).max(100_000).nullable().optional(),
		max_ingredient_nutrients: z.number().int().min(1).max(1_000_000).nullable().optional(),
	})
	.optional()

const NutritionSyncSummarySchema = z.object({
	logId: z.number().nullable(),
	triggeredBy: z.enum(["test", "manual", "cron"]),
	dryRun: z.boolean(),
	limited: z.boolean(),
	limits: z.object({
		nutrients: z.number().nullable(),
		ingredientNutrients: z.number().nullable(),
	}),
	nutrientsRead: z.number(),
	nutrientsSkipped: z.number(),
	nutrientsUpserted: z.number(),
	nutrientLookupsUpserted: z.number(),
	ingredientNutrientsRead: z.number(),
	ingredientNutrientsSkipped: z.number(),
	ingredientNutrientsUpserted: z.number(),
	errors: z.array(z.object({ scope: z.string(), message: z.string() })),
})

const triggerNutritionSyncRoute = createRoute({
	method: "post",
	path: "/sync",
	tags: ["Admin — Nutrition Sync"],
	summary: "Trigger nutrition tables sync",
	description:
		"Synchronizes legacy nutrition tables into kitchen.nutrient and kitchen.ingredient_nutrient. Use triggered_by=test for a limited production test run.",
	security: [{ AdminSecret: [] }],
	request: {
		body: {
			content: {
				"application/json": {
					schema: NutritionSyncRequestSchema,
				},
			},
			required: false,
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: NutritionSyncSummarySchema } },
			description: "Sync completed",
		},
		401: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Unauthorized — invalid or missing x-admin-secret",
		},
		500: {
			content: { "application/json": { schema: ErrorSchema.extend({ summary: NutritionSyncSummarySchema.optional() }) } },
			description: "Sync failed",
		},
	},
})

export interface NutritionAdminRoutesDeps {
	adminSecret?: string
	runSync?: (options: NutritionSyncOptions) => Promise<NutritionSyncSummary>
}

export function createNutritionAdminRoutes(deps: NutritionAdminRoutesDeps = {}) {
	const routes = new OpenAPIHono()
	const adminSecret = deps.adminSecret ?? process.env.ADMIN_SECRET
	const sync = deps.runSync ?? runNutritionSync

	routes.use("*", async (c, next) => {
		const secret = c.req.header("x-admin-secret")
		if (!secret || secret !== adminSecret) {
			return c.json({ error: "Unauthorized" }, 401)
		}
		return next()
	})

	routes.openapi(triggerNutritionSyncRoute, async (c) => {
		try {
			const body = await c.req.json().catch(() => undefined)
			const input = NutritionSyncRequestSchema.parse(body)
			const triggeredBy = input?.test_run ? "test" : input?.triggered_by
			const summary = await sync({
				dryRun: input?.dry_run,
				batchSize: input?.batch_size,
				triggeredBy,
				maxNutrients: input?.max_nutrients,
				maxIngredientNutrients: input?.max_ingredient_nutrients,
			})

			return c.json(NutritionSyncSummarySchema.parse(summary), 200)
		} catch (error) {
			const summary = typeof error === "object" && error && "summary" in error ? (error.summary as NutritionSyncSummary) : undefined
			const message = error instanceof Error ? error.message : String(error)
			return c.json({ error: "Nutrition sync failed", details: message, summary }, 500)
		}
	})

	return routes
}

export const nutritionAdminRoutes = createNutritionAdminRoutes()
