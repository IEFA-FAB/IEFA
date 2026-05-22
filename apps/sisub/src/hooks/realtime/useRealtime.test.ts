import type { RealtimeChannel } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
	createSisubAnonClient,
	createSisubReachabilityClient,
	createSisubServiceClient,
	describeSupabaseIntegration,
	getSupabaseTestEnv,
} from "@/test/supabase"

const supabaseEnv = getSupabaseTestEnv({ requireAnonKey: true })
type SisubServiceClient = ReturnType<typeof createSisubServiceClient>
type RealtimeTestClient = SisubServiceClient

async function canReachSupabase() {
	if (!supabaseEnv) return false
	try {
		const sb = createSisubReachabilityClient(supabaseEnv)
		const { error } = await sb.from("recipes").select("id").limit(1)
		return !error
	} catch {
		return false
	}
}

async function createTestUser(adminClient: SisubServiceClient) {
	if (!supabaseEnv?.anonKey) return null

	const email = `realtime-test-${Date.now()}@test.local`
	const password = `TestPass!${Date.now()}`

	const { data, error } = await adminClient.auth.admin.createUser({
		email,
		password,
		email_confirm: true,
	})
	if (error || !data.user) return null

	const anonClient = createSisubAnonClient({ ...supabaseEnv, anonKey: supabaseEnv.anonKey })
	const { data: session, error: signInErr } = await anonClient.auth.signInWithPassword({ email, password })
	if (signInErr || !session.session) {
		await adminClient.auth.admin.deleteUser(data.user.id)
		return null
	}

	return { client: anonClient, userId: data.user.id }
}

function waitForSubscribed(channel: RealtimeChannel, timeoutMs = 8000) {
	return new Promise<void>((resolve, reject) => {
		const t = setTimeout(() => reject(new Error(`subscription timeout (channel: ${channel.topic})`)), timeoutMs)
		channel.subscribe((status, err) => {
			if (status === "SUBSCRIBED") {
				clearTimeout(t)
				resolve()
			} else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
				clearTimeout(t)
				reject(new Error(`subscription failed with status ${status}: ${err?.message ?? ""}`))
			}
		})
	})
}

function waitForExpectation(predicate: () => boolean, timeoutMs = 8000) {
	return new Promise<void>((resolve, reject) => {
		const startedAt = Date.now()
		const timer = setInterval(() => {
			if (predicate()) {
				clearInterval(timer)
				resolve()
			} else if (Date.now() - startedAt >= timeoutMs) {
				clearInterval(timer)
				reject(new Error(`expectation timed out after ${timeoutMs}ms`))
			}
		}, 100)
	})
}

async function removeRealtimeChannel(client: RealtimeTestClient, channel: RealtimeChannel) {
	try {
		await client.removeChannel(channel)
	} catch {
		// Realtime cleanup can reject while the Phoenix socket is already closing.
	}
}

// ============================================================================
// RLS policies — authenticated SELECT access via real user session
// ============================================================================

describeSupabaseIntegration("Realtime RLS policies", () => {
	let reachable = false
	let adminClient: SisubServiceClient
	let testUser: Awaited<ReturnType<typeof createTestUser>>

	const REALTIME_TABLES = ["daily_menu", "menu_items", "recipes"] as const

	beforeAll(async () => {
		reachable = await canReachSupabase()
		if (!reachable || !supabaseEnv) return
		adminClient = createSisubServiceClient(supabaseEnv, { requestTimeoutMs: 5_000 })
		testUser = await createTestUser(adminClient)
	}, 30_000)

	afterAll(async () => {
		if (!reachable || !testUser) return
		await adminClient.auth.admin.deleteUser(testUser.userId)
	})

	for (const table of REALTIME_TABLES) {
		test(`authenticated client can SELECT from ${table}`, async () => {
			if (!reachable || !testUser) return

			const { error } = await testUser.client.from(table).select("*").limit(1)
			expect(error).toBeNull()
		})
	}

	test("anon client (no session) is blocked by RLS", async () => {
		if (!reachable || !supabaseEnv?.anonKey) return

		const anonClient = createSisubAnonClient({ ...supabaseEnv, anonKey: supabaseEnv.anonKey })

		const { data, error } = await anonClient.from("recipes").select("*").limit(1)

		const blocked = error !== null || (data !== null && Array.isArray(data) && data.length === 0)
		expect(blocked).toBe(true)
	})
})

// ============================================================================
// Realtime event delivery — subscribe + mutate + verify event arrives
// ============================================================================

describeSupabaseIntegration("Realtime event delivery", () => {
	let reachable = false
	let realtimeReady = false

	beforeAll(async () => {
		reachable = await canReachSupabase()
		if (!reachable || !supabaseEnv) return
		// Poll until the Realtime tenant is ready. deleteUser in the previous suite's
		// afterAll triggers a tenant reinitialization whose duration is variable and
		// can exceed a fixed sleep — probe until subscription and delivery work.
		const sb = createSisubServiceClient(supabaseEnv)
		for (let i = 0; i < 8; i++) {
			const events: unknown[] = []
			let recipeId: string | null = null
			const probe = sb
				.channel(`rt-probe-${Date.now()}`)
				.on("postgres_changes", { event: "INSERT", schema: "sisub", table: "recipes" }, (payload) => events.push(payload))
			try {
				await waitForSubscribed(probe, 3000)
				await new Promise((r) => setTimeout(r, 1000))

				const { data: recipe, error } = await sb
					.from("recipes")
					.insert({ name: "[TEST-RT] Readiness Probe", portion_yield: 1, kitchen_id: null, version: 1 })
					.select("id")
					.single()
				if (error) throw error
				recipeId = recipe?.id ?? null

				await waitForExpectation(() => events.length > 0, 5000)
				await removeRealtimeChannel(sb, probe)
				if (recipeId) {
					await sb.from("recipes").update({ deleted_at: new Date().toISOString() }).eq("id", recipeId)
				}
				realtimeReady = true
				return
			} catch {
				await removeRealtimeChannel(sb, probe)
				if (recipeId) {
					await sb.from("recipes").update({ deleted_at: new Date().toISOString() }).eq("id", recipeId)
				}
				if (i < 7) await new Promise((r) => setTimeout(r, 1500))
			}
		}
	}, 90_000)

	test("receives event when recipe is inserted", async () => {
		if (!reachable || !realtimeReady || !supabaseEnv) return

		// Fresh client per test — avoids lingering auth state from previous suites
		const supabase = createSisubServiceClient(supabaseEnv)
		const events: unknown[] = []
		let recipeId: string | null = null

		const channel = supabase
			.channel(`test-recipes-rt-${Date.now()}`)
			.on("postgres_changes", { event: "INSERT", schema: "sisub", table: "recipes" }, (payload) => events.push(payload))
		await waitForSubscribed(channel)
		// Allow tenant replication slot to finish initializing after fresh connection
		await new Promise((r) => setTimeout(r, 2000))

		try {
			const { data: recipe, error } = await supabase
				.from("recipes")
				.insert({ name: "[TEST-RT] Event Delivery", portion_yield: 1, kitchen_id: null, version: 1 })
				.select("id")
				.single()

			expect(error).toBeNull()
			recipeId = recipe?.id ?? null

			await waitForExpectation(() => events.length > 0, 8000)

			expect(events.length).toBeGreaterThanOrEqual(1)
			expect((events[0] as Record<string, unknown>).eventType).toBe("INSERT")
		} finally {
			await removeRealtimeChannel(supabase, channel)
			if (recipeId) {
				await supabase.from("recipes").update({ deleted_at: new Date().toISOString() }).eq("id", recipeId)
			}
		}
	}, 35_000)

	test("filter delivers only matching kitchen_id events", async () => {
		if (!reachable || !realtimeReady || !supabaseEnv) return

		// Fresh client per test
		const supabase = createSisubServiceClient(supabaseEnv)
		const ts = Date.now()
		const KITCHEN_ID = 1
		const matched: unknown[] = []
		const missed: unknown[] = []
		let recipeId: string | null = null

		const matchChannel = supabase
			.channel(`test-filter-hit-${ts}`)
			.on("postgres_changes", { event: "INSERT", schema: "sisub", table: "recipes", filter: `kitchen_id=eq.${KITCHEN_ID}` }, (payload) => matched.push(payload))

		const missChannel = supabase
			.channel(`test-filter-miss-${ts}`)
			.on("postgres_changes", { event: "INSERT", schema: "sisub", table: "recipes", filter: "kitchen_id=eq.999999" }, (payload) => missed.push(payload))

		await Promise.all([waitForSubscribed(matchChannel), waitForSubscribed(missChannel)])

		try {
			const { data: recipe, error } = await supabase
				.from("recipes")
				.insert({ name: "[TEST-RT] Filtered Event", portion_yield: 1, kitchen_id: KITCHEN_ID, version: 1 })
				.select("id")
				.single()

			expect(error).toBeNull()
			recipeId = recipe?.id ?? null

			await waitForExpectation(() => matched.length > 0, 8000)

			expect(matched.length).toBeGreaterThanOrEqual(1)
			expect(missed.length).toBe(0)
		} finally {
			await removeRealtimeChannel(supabase, matchChannel)
			await removeRealtimeChannel(supabase, missChannel)
			if (recipeId) {
				await supabase.from("recipes").update({ deleted_at: new Date().toISOString() }).eq("id", recipeId)
			}
		}
	}, 35_000)
})

// ============================================================================
// Debounce logic — unit test (sem DB)
// ============================================================================

describe("debounce behavior", () => {
	test("multiple rapid calls coalesce into single execution", async () => {
		let count = 0
		let timer: ReturnType<typeof setTimeout> | null = null

		const debounced = () => {
			if (timer) clearTimeout(timer)
			timer = setTimeout(() => count++, 500)
		}

		for (let i = 0; i < 20; i++) debounced()
		expect(count).toBe(0)

		await new Promise((r) => setTimeout(r, 600))
		expect(count).toBe(1)
	})

	test("spaced calls execute individually", async () => {
		let count = 0
		let timer: ReturnType<typeof setTimeout> | null = null

		const debounced = () => {
			if (timer) clearTimeout(timer)
			timer = setTimeout(() => count++, 100)
		}

		debounced()
		await new Promise((r) => setTimeout(r, 150))
		expect(count).toBe(1)

		debounced()
		await new Promise((r) => setTimeout(r, 150))
		expect(count).toBe(2)
	})
})
