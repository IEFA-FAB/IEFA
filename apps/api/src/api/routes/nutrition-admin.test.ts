import { describe, expect, test } from "bun:test"
import { createNutritionAdminRoutes } from "./nutrition-admin.ts"

type Row = Record<string, unknown>

/**
 * O disparo agora passa por `claimSync`, que recupera execuções mortas antes de inserir — o
 * fake precisa da cadeia de leitura, não só do `insert`.
 */
class FakeSupabase {
	inserts: Array<{ table: string; row: Row }> = []

	from(table: string) {
		const builder = {
			select: (_columns?: string) => builder,
			eq: (_c: string, _v: unknown) => builder,
			in: (_c: string, _v: unknown[]) => builder,
			update: (_patch: Row) => builder,
			insert: (row: Row) => {
				this.inserts.push({ table, row: { ...row } })
				return {
					select: (_columns: string) => ({
						single: () => Promise.resolve({ data: { id: 42 }, error: null }),
					}),
				}
			},
			// biome-ignore lint/suspicious/noThenProperty: o builder do PostgREST é um thenable e o código faz await nele
			then: (resolve: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve(resolve({ data: [], error: null })),
		}
		return builder
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
		expect(supabase.inserts).toHaveLength(1)
		expect(supabase.inserts[0].table).toBe("integration_sync_log")
		// `source` é o que impede a execução da nutrição de ocupar a vaga do Compras.gov, e
		// `triggered_by` precisa chegar como veio — o painel exibe o rótulo `test`.
		expect(supabase.inserts[0].row).toMatchObject({ triggered_by: "test", total_steps: 1, source: "nutrition_reference", status: "running" })
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
		expect(supabase.inserts[0].row).toMatchObject({ triggered_by: "test", total_steps: 2, source: "nutrition_reference" })
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
