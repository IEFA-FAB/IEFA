import { describe, expect, test } from "bun:test"
import type { NutritionSyncSummary } from "../../workers/nutrition-sync/index.ts"
import { createNutritionAdminRoutes } from "./nutrition-admin.ts"

const summary: NutritionSyncSummary = {
	logId: 77,
	triggeredBy: "test",
	dryRun: true,
	limited: true,
	limits: {
		nutrients: 25,
		ingredientNutrients: 100,
	},
	nutrientsRead: 2,
	nutrientsSkipped: 0,
	nutrientsUpserted: 0,
	nutrientLookupsUpserted: 0,
	ingredientNutrientsRead: 1,
	ingredientNutrientsSkipped: 0,
	ingredientNutrientsUpserted: 0,
	errors: [],
}

describe("Admin nutrition sync routes", () => {
	test("rejects requests without admin secret", async () => {
		const app = createNutritionAdminRoutes({ adminSecret: "secret", runSync: async () => summary })

		const res = await app.request("/sync", { method: "POST" })
		const body = await res.json()

		expect(res.status).toBe(401)
		expect(body).toEqual({ error: "Unauthorized" })
	})

	test("runs sync with request options when admin secret is valid", async () => {
		const calls: unknown[] = []
		const app = createNutritionAdminRoutes({
			adminSecret: "secret",
			runSync: async (options) => {
				calls.push(options)
				return { ...summary, dryRun: options.dryRun ?? false }
			},
		})

		const res = await app.request("/sync", {
			method: "POST",
			headers: { "x-admin-secret": "secret", "content-type": "application/json" },
			body: JSON.stringify({ test_run: true, batch_size: 25 }),
		})
		const body = await res.json()

		expect(res.status).toBe(200)
		expect(calls).toEqual([{ dryRun: undefined, batchSize: 25, triggeredBy: "test", maxNutrients: undefined, maxIngredientNutrients: undefined }])
		expect(body).toMatchObject({ triggeredBy: "test", nutrientsRead: 2, ingredientNutrientsRead: 1 })
	})

	test("returns failure summary when sync throws", async () => {
		const error = Object.assign(new Error("kitchen.nutrient: permission denied"), { summary })
		const app = createNutritionAdminRoutes({
			adminSecret: "secret",
			runSync: async () => {
				throw error
			},
		})

		const res = await app.request("/sync", {
			method: "POST",
			headers: { "x-admin-secret": "secret" },
		})
		const body = await res.json()

		expect(res.status).toBe(500)
		expect(body).toMatchObject({
			error: "Nutrition sync failed",
			details: "kitchen.nutrient: permission denied",
			summary,
		})
	})
})
