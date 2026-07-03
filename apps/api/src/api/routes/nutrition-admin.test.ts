import { describe, expect, test } from "bun:test"
import { createNutritionAdminRoutes } from "./nutrition-admin.ts"

type Row = Record<string, unknown>

class FakeSupabase {
	inserts: Array<{ table: string; row: Row }> = []

	from(table: string) {
		return {
			insert: (row: Row) => {
				this.inserts.push({ table, row: { ...row } })
				return {
					select: (_columns: string) => ({
						single: () => Promise.resolve({ data: { id: 42 }, error: null }),
					}),
				}
			},
		}
	}
}

describe("Admin nutrition sync routes", () => {
	test("rejects requests without admin secret", async () => {
		const app = createNutritionAdminRoutes({
			adminSecret: "secret",
			getSupabase: () => new FakeSupabase() as any,
		})

		const res = await app.request("/sync", { method: "POST" })
		const body = await res.json()

		expect(res.status).toBe(401)
		expect(body).toEqual({ error: "Unauthorized" })
	})

	test("starts a limited production test run and logs triggered_by=test", async () => {
		const supabase = new FakeSupabase()
		const calls: unknown[] = []
		const app = createNutritionAdminRoutes({
			adminSecret: "secret",
			getSupabase: () => supabase as any,
			hasLiveSync: async () => false,
			runSync: async (options) => {
				calls.push(options)
				return options.syncId
			},
		})

		const res = await app.request("/sync", {
			method: "POST",
			headers: { "x-admin-secret": "secret", "content-type": "application/json" },
			body: JSON.stringify({ test_run: true }),
		})
		const body = await res.json()

		expect(res.status).toBe(202)
		expect(body).toEqual({ sync_id: 42, message: "Sync iniciada em background" })
		expect(supabase.inserts).toEqual([{ table: "nutrition_sync_log", row: { triggered_by: "test", total_steps: 1 } }])
		expect(calls).toEqual([{ triggeredBy: "test", syncId: 42, maxSteps: undefined }])
	})

	test("allows explicit max_steps for test runs", async () => {
		const supabase = new FakeSupabase()
		const calls: unknown[] = []
		const app = createNutritionAdminRoutes({
			adminSecret: "secret",
			getSupabase: () => supabase as any,
			hasLiveSync: async () => false,
			runSync: async (options) => {
				calls.push(options)
				return options.syncId
			},
		})

		const res = await app.request("/sync", {
			method: "POST",
			headers: { "x-admin-secret": "secret", "content-type": "application/json" },
			body: JSON.stringify({ triggered_by: "test", max_steps: 2 }),
		})

		expect(res.status).toBe(202)
		expect(supabase.inserts).toEqual([{ table: "nutrition_sync_log", row: { triggered_by: "test", total_steps: 2 } }])
		expect(calls).toEqual([{ triggeredBy: "test", syncId: 42, maxSteps: 2 }])
	})

	test("returns 409 when another nutrition sync is running", async () => {
		const supabase = new FakeSupabase()
		const app = createNutritionAdminRoutes({
			adminSecret: "secret",
			getSupabase: () => supabase as any,
			hasLiveSync: async () => true,
		})

		const res = await app.request("/sync", {
			method: "POST",
			headers: { "x-admin-secret": "secret" },
		})
		const body = await res.json()

		expect(res.status).toBe(409)
		expect(body).toEqual({ error: "Sync já está em andamento" })
		expect(supabase.inserts).toHaveLength(0)
	})
})
