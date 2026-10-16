import type { CookieSessionOptions, CookieSessionResult } from "@iefa/supabase-kit"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const resolveCookieSessionUser = vi.fn(
	async (_opts: CookieSessionOptions): Promise<CookieSessionResult> => ({ ok: false, kind: "no-session", status: 401, reason: "sem sessão no cookie" })
)

vi.mock("@iefa/supabase-kit", () => ({ resolveCookieSessionUser }))
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
	let warn: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		resolveCookieSessionUser.mockClear()
		warn = vi.spyOn(console, "warn").mockImplementation(() => {})
	})

	afterEach(() => {
		warn.mockRestore()
	})

	test("valida com a publishable key e o cookie da request", async () => {
		resolveCookieSessionUser.mockResolvedValueOnce({ ok: true, user: { id: "u-1" } as never })

		await expect(requireSisubUser(eventWithCookie("sb-x-auth-token=abc=="))).resolves.toEqual({ id: "u-1" })
		expect(resolveCookieSessionUser).toHaveBeenCalledWith({
			url: "https://sisub.example",
			publishableKey: "publishable-key",
			cookieHeader: "sb-x-auth-token=abc==",
		})
	})

	test("sem sessão é 401, sem log", async () => {
		await expect(requireSisubUser(eventWithCookie())).rejects.toMatchObject({ status: 401 })
		expect(resolveCookieSessionUser.mock.calls[0]?.[0]?.cookieHeader).toBeUndefined()
		expect(warn).not.toHaveBeenCalled()
	})

	test("recusa do gateway é 401 com o motivo no log (chave inválida não parece sessão perdida)", async () => {
		resolveCookieSessionUser.mockResolvedValueOnce({ ok: false, kind: "rejected", status: 401, reason: "Invalid API key" })
		await expect(requireSisubUser(eventWithCookie("a=b"))).rejects.toMatchObject({ status: 401 })
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("Invalid API key"))
	})

	test("GoTrue fora é 503, não 401: o cliente lê 401 como sessão perdida", async () => {
		resolveCookieSessionUser.mockResolvedValueOnce({ ok: false, kind: "unavailable", status: 503, reason: "timed out" })
		await expect(requireSisubUser(eventWithCookie("a=b"))).rejects.toMatchObject({ status: 503 })
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("timed out"))
	})
})
