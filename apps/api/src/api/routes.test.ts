import { describe, expect, test } from "bun:test"

// Integration tests — require real env vars: API_SUPABASE_URL, API_SUPABASE_SERVICE_ROLE_KEY
// Tests are skipped automatically when env vars are not set.

const hasEnv = !!process.env.API_SUPABASE_URL && !!process.env.API_SUPABASE_SERVICE_ROLE_KEY

// Dynamic import prevents module-level ZodError when env vars are absent
const { api } = hasEnv ? await import("./routes") : { api: null as any }

async function get(path: string) {
	const res = await api.request(path)
	const body = await res.json()
	return { res, body: body as unknown[] }
}

describe.skipIf(!hasEnv)("Integration: GET /opinion", () => {
	test("returns 200 with array", async () => {
		const { res, body } = await get("/opinion?limit=10")
		expect(res.status).toBe(200)
		expect(Array.isArray(body)).toBe(true)
	})

	test("limit is respected", async () => {
		const { res, body } = await get("/opinion?limit=3")
		expect(res.status).toBe(200)
		expect(body.length).toBeLessThanOrEqual(3)
	})

	test("items have expected shape", async () => {
		const { body } = await get("/opinion?limit=1")
		if (body.length === 0) return
		const item = body[0] as Record<string, unknown>
		expect(item).toHaveProperty("id")
		expect(item).toHaveProperty("created_at")
		expect(item).toHaveProperty("value")
		expect(item).toHaveProperty("question")
		expect(item).toHaveProperty("userId")
	})

	test("filter by userId returns only matching records", async () => {
		const { body: all } = await get("/opinion?limit=1")
		if (all.length === 0) return
		const userId = (all[0] as Record<string, unknown>).userId as string
		const { res, body } = await get(`/opinion?userId=${userId}&limit=50`)
		expect(res.status).toBe(200)
		expect((body as Record<string, unknown>[]).every((item) => item.userId === userId)).toBe(true)
	})

	test("filter by question_ilike returns only matching records", async () => {
		const { body: all } = await get("/opinion?limit=1")
		if (all.length === 0) return
		const question = (all[0] as Record<string, unknown>).question as string
		const fragment = question.slice(0, 3)
		const { res, body } = await get(`/opinion?question_ilike=${encodeURIComponent(fragment)}&limit=50`)
		expect(res.status).toBe(200)
		expect((body as Record<string, unknown>[]).every((item) => (item.question as string).toLowerCase().includes(fragment.toLowerCase()))).toBe(true)
	})
})

describe.skipIf(!hasEnv)("Integration: GET /rancho_previsoes", () => {
	test("returns 200 with array", async () => {
		const { res, body } = await get("/rancho_previsoes?limit=10")
		expect(res.status).toBe(200)
		expect(Array.isArray(body)).toBe(true)
	})

	test("limit is respected", async () => {
		const { res, body } = await get("/rancho_previsoes?limit=3")
		expect(res.status).toBe(200)
		expect(body.length).toBeLessThanOrEqual(3)
	})

	test("items have expected shape", async () => {
		const { body } = await get("/rancho_previsoes?limit=1")
		if (body.length === 0) return
		const item = body[0] as Record<string, unknown>
		expect(item).toHaveProperty("user_id")
		expect(item).toHaveProperty("date")
		expect(item).toHaveProperty("meal")
		expect(item).toHaveProperty("will_eat")
		expect(item).toHaveProperty("mess_hall_id")
	})

	test("filter by meal returns only that meal type", async () => {
		const meals = ["cafe", "almoco", "janta", "ceia"] as const
		for (const meal of meals) {
			const { res, body } = await get(`/rancho_previsoes?meal=${meal}&limit=10`)
			expect(res.status).toBe(200)
			if (body.length > 0) {
				expect((body as Record<string, unknown>[]).every((item) => item.meal === meal)).toBe(true)
			}
		}
	})

	test("filter by date returns only that date", async () => {
		const { body: all } = await get("/rancho_previsoes?limit=1")
		if (all.length === 0) return
		const date = (all[0] as Record<string, unknown>).date as string
		const { res, body } = await get(`/rancho_previsoes?date=${date}&limit=100`)
		expect(res.status).toBe(200)
		expect((body as Record<string, unknown>[]).every((item) => item.date === date)).toBe(true)
	})
})

describe.skipIf(!hasEnv)("Integration: GET /wherewhowhen", () => {
	test("returns 200 with array", async () => {
		const { res, body } = await get("/wherewhowhen?limit=10")
		expect(res.status).toBe(200)
		expect(Array.isArray(body)).toBe(true)
	})

	test("limit is respected", async () => {
		const { res, body } = await get("/wherewhowhen?limit=3")
		expect(res.status).toBe(200)
		expect(body.length).toBeLessThanOrEqual(3)
	})

	test("items have expected shape", async () => {
		const { body } = await get("/wherewhowhen?limit=1")
		if (body.length === 0) return
		const item = body[0] as Record<string, unknown>
		expect(item).toHaveProperty("user_id")
		expect(item).toHaveProperty("date")
		expect(item).toHaveProperty("meal")
		expect(item).toHaveProperty("mess_hall_id")
	})

	test("filter by meal returns only that meal type", async () => {
		const { body: all } = await get("/wherewhowhen?limit=1")
		if (all.length === 0) return
		const meal = (all[0] as Record<string, unknown>).meal as string
		const { res, body } = await get(`/wherewhowhen?meal=${meal}&limit=50`)
		expect(res.status).toBe(200)
		expect((body as Record<string, unknown>[]).every((item) => item.meal === meal)).toBe(true)
	})
})

describe.skipIf(!hasEnv)("Integration: GET /user-military-data", () => {
	test("returns 200 with array", async () => {
		const { res, body } = await get("/user-military-data?limit=10")
		expect(res.status).toBe(200)
		expect(Array.isArray(body)).toBe(true)
	})

	test("limit is respected", async () => {
		const { res, body } = await get("/user-military-data?limit=3")
		expect(res.status).toBe(200)
		expect(body.length).toBeLessThanOrEqual(3)
	})

	test("items have expected shape", async () => {
		const { body } = await get("/user-military-data?limit=1")
		if (body.length === 0) return
		const item = body[0] as Record<string, unknown>
		expect(item).toHaveProperty("nrOrdem")
		expect(item).toHaveProperty("nrCpf")
		expect(item).toHaveProperty("nmGuerra")
		expect(item).toHaveProperty("nmPessoa")
		expect(item).toHaveProperty("sgPosto")
		expect(item).toHaveProperty("sgOrg")
	})

	test("filter by sgOrg returns only that org", async () => {
		const { body: all } = await get("/user-military-data?limit=1")
		if (all.length === 0) return
		const sgOrg = (all[0] as Record<string, unknown>).sgOrg as string
		const { res, body } = await get(`/user-military-data?sgOrg=${encodeURIComponent(sgOrg)}&limit=50`)
		expect(res.status).toBe(200)
		expect((body as Record<string, unknown>[]).every((item) => item.sgOrg === sgOrg)).toBe(true)
	})

	test("filter by nmGuerra_ilike returns only matching records", async () => {
		const { body: all } = await get("/user-military-data?limit=1")
		if (all.length === 0) return
		const nmGuerra = (all[0] as Record<string, unknown>).nmGuerra as string
		const fragment = nmGuerra.slice(0, 3)
		const { res, body } = await get(`/user-military-data?nmGuerra_ilike=${encodeURIComponent(fragment)}&limit=50`)
		expect(res.status).toBe(200)
		expect((body as Record<string, unknown>[]).every((item) => (item.nmGuerra as string).toLowerCase().includes(fragment.toLowerCase()))).toBe(true)
	})
})

describe.skipIf(!hasEnv)("Integration: GET /user-data", () => {
	test("returns 200 with array", async () => {
		const { res, body } = await get("/user-data?limit=10")
		expect(res.status).toBe(200)
		expect(Array.isArray(body)).toBe(true)
	})

	test("limit is respected", async () => {
		const { res, body } = await get("/user-data?limit=3")
		expect(res.status).toBe(200)
		expect(body.length).toBeLessThanOrEqual(3)
	})

	test("items have expected shape", async () => {
		const { body } = await get("/user-data?limit=1")
		if (body.length === 0) return
		const item = body[0] as Record<string, unknown>
		expect(item).toHaveProperty("id")
		expect(item).toHaveProperty("created_at")
		expect(item).toHaveProperty("email")
		expect(item).toHaveProperty("nrOrdem")
	})

	test("filter by email_ilike returns only matching records", async () => {
		const { body: all } = await get("/user-data?limit=1")
		if (all.length === 0) return
		const email = (all[0] as Record<string, unknown>).email as string
		const fragment = email.split("@")[0].slice(0, 3)
		const { res, body } = await get(`/user-data?email_ilike=${encodeURIComponent(fragment)}&limit=50`)
		expect(res.status).toBe(200)
		expect((body as Record<string, unknown>[]).every((item) => (item.email as string).toLowerCase().includes(fragment.toLowerCase()))).toBe(true)
	})
})

describe.skipIf(!hasEnv)("Integration: GET /units", () => {
	test("returns 200 with array", async () => {
		const { res, body } = await get("/units")
		expect(res.status).toBe(200)
		expect(Array.isArray(body)).toBe(true)
	})

	test("items have expected shape", async () => {
		const { body } = await get("/units?limit=1")
		expect(body.length).toBeGreaterThan(0)
		const item = body[0] as Record<string, unknown>
		expect(item).toHaveProperty("id")
		expect(item).toHaveProperty("code")
		expect(item).toHaveProperty("display_name")
		expect(typeof item.id).toBe("number")
		expect(typeof item.code).toBe("string")
	})

	test("filter by code returns only that unit", async () => {
		const { body: all } = await get("/units?limit=1")
		expect(all.length).toBeGreaterThan(0)
		const code = (all[0] as Record<string, unknown>).code as string
		const { res, body } = await get(`/units?code=${encodeURIComponent(code)}`)
		expect(res.status).toBe(200)
		expect((body as Record<string, unknown>[]).every((item) => item.code === code)).toBe(true)
	})

	test("filter by code_ilike is case-insensitive", async () => {
		const { body: all } = await get("/units?limit=1")
		expect(all.length).toBeGreaterThan(0)
		const code = (all[0] as Record<string, unknown>).code as string
		const fragment = code.slice(0, 2).toLowerCase()
		const { res, body } = await get(`/units?code_ilike=${encodeURIComponent(fragment)}`)
		expect(res.status).toBe(200)
		expect((body as Record<string, unknown>[]).every((item) => (item.code as string).toLowerCase().includes(fragment))).toBe(true)
	})
})

describe.skipIf(!hasEnv)("Integration: GET /mess-halls", () => {
	test("returns 200 with array", async () => {
		const { res, body } = await get("/mess-halls")
		expect(res.status).toBe(200)
		expect(Array.isArray(body)).toBe(true)
	})

	test("items have expected shape", async () => {
		const { body } = await get("/mess-halls?limit=1")
		expect(body.length).toBeGreaterThan(0)
		const item = body[0] as Record<string, unknown>
		expect(item).toHaveProperty("id")
		expect(item).toHaveProperty("unit_id")
		expect(item).toHaveProperty("code")
		expect(item).toHaveProperty("display_name")
		expect(typeof item.id).toBe("number")
		expect(typeof item.unit_id).toBe("number")
	})

	test("filter by unit_id returns only that unit's mess halls", async () => {
		const { body: all } = await get("/mess-halls?limit=1")
		expect(all.length).toBeGreaterThan(0)
		const unitId = (all[0] as Record<string, unknown>).unit_id as number
		const { res, body } = await get(`/mess-halls?unit_id=${unitId}`)
		expect(res.status).toBe(200)
		expect((body as Record<string, unknown>[]).every((item) => item.unit_id === unitId)).toBe(true)
	})
})
