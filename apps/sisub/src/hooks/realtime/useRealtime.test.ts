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
		adminClient = createSisubServiceClient(supabaseEnv)
		testUser = await createTestUser(adminClient)
	})

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

	beforeAll(async () => {
		reachable = await canReachSupabase()
		if (!reachable || !supabaseEnv) return
		// Poll until the Realtime tenant is ready. deleteUser in the previous suite's
		// afterAll triggers a tenant reinitialization whose duration is variable and
		// can exceed a fixed sleep — probe until a subscription completes instead.
		const sb = createSisubServiceClient(supabaseEnv)
		for (let i = 0; i < 8; i++) {
			const probe = sb.channel(`rt-probe-${Date.now()}`)
			try {
				await waitForSubscribed(probe, 3000)
				await sb.removeChannel(probe)
				return
			} catch {
				await sb.removeChannel(probe)
				if (i < 7) await new Promise((r) => setTimeout(r, 1500))
			}
		}
	}, 35_000)

	test("receives event when recipe is inserted", async () => {
		if (!reachable || !supabaseEnv) return

		// Fresh client per test — avoids lingering auth state from previous suites
		const supabase = createSisubServiceClient(supabaseEnv)
		const events: unknown[] = []

		const channel = supabase
			.channel(`test-recipes-rt-${Date.now()}`)
			.on("postgres_changes", { event: "INSERT", schema: "sisub", table: "recipes" }, (payload) => events.push(payload))
		await waitForSubscribed(channel)
		// Allow tenant replication slot to finish initializing after fresh connection
		await new Promise((r) => setTimeout(r, 2000))

		const { data: recipe, error } = await supabase
			.from("recipes")
			.insert({ name: "[TEST-RT] Event Delivery", portion_yield: 1, kitchen_id: null, version: 1 })
			.select("id")
			.single()

		expect(error).toBeNull()

		await new Promise((r) => setTimeout(r, 3000))
		await supabase.removeChannel(channel)

		if (recipe) {
			await supabase.from("recipes").update({ deleted_at: new Date().toISOString() }).eq("id", recipe.id)
		}

		expect(events.length).toBeGreaterThanOrEqual(1)
		expect((events[0] as Record<string, unknown>).eventType).toBe("INSERT")
	}, 15_000)

	test("filter delivers only matching kitchen_id events", async () => {
		if (!reachable || !supabaseEnv) return

		// Fresh client per test
		const supabase = createSisubServiceClient(supabaseEnv)
		const ts = Date.now()
		const KITCHEN_ID = 1
		const matched: unknown[] = []
		const missed: unknown[] = []

		const matchChannel = supabase
			.channel(`test-filter-hit-${ts}`)
			.on("postgres_changes", { event: "INSERT", schema: "sisub", table: "recipes", filter: `kitchen_id=eq.${KITCHEN_ID}` }, (payload) => matched.push(payload))

		const missChannel = supabase
			.channel(`test-filter-miss-${ts}`)
			.on("postgres_changes", { event: "INSERT", schema: "sisub", table: "recipes", filter: "kitchen_id=eq.999999" }, (payload) => missed.push(payload))

		await Promise.all([waitForSubscribed(matchChannel), waitForSubscribed(missChannel)])

		const { data: recipe, error } = await supabase
			.from("recipes")
			.insert({ name: "[TEST-RT] Filtered Event", portion_yield: 1, kitchen_id: KITCHEN_ID, version: 1 })
			.select("id")
			.single()

		expect(error).toBeNull()

		await new Promise((r) => setTimeout(r, 3000))
		await supabase.removeChannel(matchChannel)
		await supabase.removeChannel(missChannel)

		if (recipe) {
			await supabase.from("recipes").update({ deleted_at: new Date().toISOString() }).eq("id", recipe.id)
		}

		expect(matched.length).toBeGreaterThanOrEqual(1)
		expect(missed.length).toBe(0)
	}, 15_000)
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
