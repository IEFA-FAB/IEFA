import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, test, vi } from "vitest"

const getUser = vi.fn()
const createCookieAuthClient = vi.fn((_opts: { url: string; key: string; cookieHeader: string | undefined }) => ({ auth: { getUser } }))

vi.mock("@iefa/supabase-kit", () => ({ createCookieAuthClient }))
vi.mock("@/lib/env.server", () => ({
	envServer: {
		VITE_SISUB_SUPABASE_URL: "https://sisub.example",
		VITE_SISUB_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
		SISUB_SUPABASE_SECRET_KEY: "secret-key",
	},
}))

const { requireSisubUser } = await import("./nitro-auth.server")

function eventWithCookie(cookie?: string) {
	const headers = new Headers(cookie ? { cookie } : {})
	return { req: { headers } } as unknown as Parameters<typeof requireSisubUser>[0]
}

describe("requireSisubUser — sessão nas rotas Nitro", () => {
	beforeEach(() => {
		getUser.mockReset()
		createCookieAuthClient.mockClear()
	})

	test("monta o client de auth com a publishable key e o cookie da request", async () => {
		getUser.mockResolvedValue({ data: { user: { id: "u-1" } }, error: null })

		await expect(requireSisubUser(eventWithCookie("sb-x-auth-token=abc=="))).resolves.toEqual({ id: "u-1" })

		const opts = createCookieAuthClient.mock.calls[0]?.[0]
		expect(opts?.key).toBe("publishable-key")
		expect(opts?.url).toBe("https://sisub.example")
		expect(opts?.cookieHeader).toBe("sb-x-auth-token=abc==")
	})

	test("sem sessão é 401", async () => {
		getUser.mockResolvedValue({ data: { user: null }, error: null })
		await expect(requireSisubUser(eventWithCookie())).rejects.toMatchObject({ status: 401 })
		expect(createCookieAuthClient.mock.calls[0]?.[0]?.cookieHeader).toBeUndefined()
	})

	test("erro do getUser é 401 mesmo com usuário", async () => {
		getUser.mockResolvedValue({ data: { user: { id: "u-1" } }, error: new Error("jwt expired") })
		await expect(requireSisubUser(eventWithCookie("a=b"))).rejects.toMatchObject({ status: 401 })
	})
})

/** As rotas SSE não sobem em teste unitário; o que se cobra é que nenhuma volte a montar client à mão. */
describe("os endpoints de chat montam os clients pelo kit", () => {
	const ROUTES = [resolve(__dirname, "../../routes/api/analytics/stream.post.ts"), resolve(__dirname, "../../routes/api/module-chat/stream.post.ts")]

	test.each(ROUTES)("%s", (route) => {
		const source = readFileSync(route, "utf8")
		expect(source).toContain("requireSisubUser(event)")
		expect(source).not.toContain("@supabase/ssr")
		expect(source).not.toContain("@supabase/supabase-js")
		expect(source).not.toContain("SECRET_KEY")
	})
})
