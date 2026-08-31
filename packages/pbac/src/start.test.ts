import { afterEach, describe, expect, mock, test } from "bun:test"
import type { User } from "@supabase/supabase-js"

/**
 * O módulo lê `getRequest`/`setResponseStatus` do TanStack Start. Aqui eles são
 * dublês controláveis: `currentRequest` é o que o Start entregaria, e
 * `lastStatus` registra o código sinalizado antes do throw — que é o ponto
 * inteiro dos helpers (sem ele o framework devolve 500).
 */
let currentRequest: Request | undefined
let lastStatus: number | undefined

mock.module("@tanstack/react-start/server", () => ({
	getRequest: () => currentRequest,
	setResponseStatus: (status: number) => {
		lastStatus = status
	},
}))

const { createRequestAuth, forbidden, unauthorized } = await import("./start.ts")

const fakeUser = (id = "u-1") => ({ id, email: `${id}@fab.mil.br` }) as User

/** Client de auth que conta quantas vezes o JWT foi validado de fato. */
function authClientSpy(user: User | null, delayMs = 0) {
	let calls = 0
	return {
		calls: () => calls,
		client: () => ({
			auth: {
				getUser: async () => {
					calls++
					if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
					return { data: { user } }
				},
			},
		}),
	}
}

/** Client de permissões que devolve as linhas cruas de `user_permissions`. */
// biome-ignore lint/suspicious/noExplicitAny: dublê mínimo do SupabaseClient
function permissionsClient(rows: Array<Record<string, unknown>>): any {
	return {
		from: () => ({
			select: () => ({
				eq: async () => ({ data: rows, error: null }),
			}),
		}),
	}
}

afterEach(() => {
	currentRequest = undefined
	lastStatus = undefined
})

describe("createRequestAuth — cache request-scoped", () => {
	test("valida o JWT uma vez só por request, mesmo com várias chamadas", async () => {
		currentRequest = new Request("https://app.local/")
		const spy = authClientSpy(fakeUser())
		const auth = createRequestAuth({ getAuthClient: spy.client })

		await auth.getRequestUser()
		await auth.getRequestUser()
		await auth.requireUserId()

		expect(spy.calls()).toBe(1)
	})

	test("chamadas concorrentes dividem um único round-trip", async () => {
		currentRequest = new Request("https://app.local/")
		const spy = authClientSpy(fakeUser(), 5)
		const auth = createRequestAuth({ getAuthClient: spy.client })

		// Sem cachear a Promise (e sim o valor resolvido), as três chamadas sairiam
		// antes da primeira resolver e pagariam três round-trips.
		await Promise.all([auth.getRequestUser(), auth.getRequestUser(), auth.getRequestUser()])

		expect(spy.calls()).toBe(1)
	})

	test("requests diferentes não compartilham a sessão", async () => {
		const spy = authClientSpy(fakeUser())
		const auth = createRequestAuth({ getAuthClient: spy.client })

		currentRequest = new Request("https://app.local/a")
		await auth.getRequestUser()
		currentRequest = new Request("https://app.local/b")
		await auth.getRequestUser()

		expect(spy.calls()).toBe(2)
	})

	test("fora de um contexto de request resolve sem cache, em vez de devolver null", async () => {
		currentRequest = undefined
		const spy = authClientSpy(fakeUser("u-9"))
		const auth = createRequestAuth({ getAuthClient: spy.client })

		// A variante do assignment-selection devolvia `null` aqui — o que inventa um
		// logout para quem está autenticado.
		expect(await auth.getRequestUser()).toMatchObject({ id: "u-9" })
	})

	test("falha do GoTrue propaga, não vira sessão ausente", async () => {
		currentRequest = new Request("https://app.local/")
		const auth = createRequestAuth({
			getAuthClient: () => ({
				auth: {
					getUser: async () => {
						throw new Error("ECONNRESET")
					},
				},
			}),
		})

		// Engolir isto num `null` deslogaria a base inteira durante uma queda.
		expect(auth.getRequestUser()).rejects.toThrow("ECONNRESET")
	})
})

describe("createRequestAuth — gates", () => {
	test("requireUserId sinaliza 401 antes de lançar quando não há sessão", async () => {
		currentRequest = new Request("https://app.local/")
		const auth = createRequestAuth({ getAuthClient: authClientSpy(null).client })

		expect(auth.requireUserId()).rejects.toThrow("UNAUTHORIZED")
		await auth.requireUserId().catch(() => {})
		expect(lastStatus).toBe(401)
	})

	test("requireLevel devolve o contexto quando a permissão cobre o nível", async () => {
		currentRequest = new Request("https://app.local/")
		const auth = createRequestAuth({
			getAuthClient: authClientSpy(fakeUser()).client,
			getPermissionsClient: () => permissionsClient([{ module: "sucont", level: 2 }]),
		})

		const ctx = await auth.requireLevel("sucont", 2)
		expect(ctx.userId).toBe("u-1")
	})

	test("requireLevel sinaliza 403 quando o nível é insuficiente", async () => {
		currentRequest = new Request("https://app.local/")
		const auth = createRequestAuth({
			getAuthClient: authClientSpy(fakeUser()).client,
			getPermissionsClient: () => permissionsClient([{ module: "sucont", level: 1 }]),
		})

		expect(auth.requireLevel("sucont", 2)).rejects.toThrow("FORBIDDEN: sucont")
		await auth.requireLevel("sucont", 2).catch(() => {})
		// 403, não 401: o usuário está autenticado — errar isso manda quem já entrou
		// de volta para a tela de login, num laço.
		expect(lastStatus).toBe(403)
	})

	test("sem sessão, requireLevel para em 401 e nem consulta permissões", async () => {
		currentRequest = new Request("https://app.local/")
		let permissionsRead = false
		const auth = createRequestAuth({
			getAuthClient: authClientSpy(null).client,
			getPermissionsClient: () => {
				permissionsRead = true
				return permissionsClient([])
			},
		})

		await auth.requireLevel("sucont", 1).catch(() => {})
		expect(lastStatus).toBe(401)
		expect(permissionsRead).toBe(false)
	})

	test("requireAuth sem getPermissionsClient falha explicitamente", async () => {
		currentRequest = new Request("https://app.local/")
		const auth = createRequestAuth({ getAuthClient: authClientSpy(fakeUser()).client })

		expect(auth.requireAuth()).rejects.toThrow("exige `getPermissionsClient`")
	})
})

describe("helpers de status", () => {
	test("unauthorized sinaliza 401", () => {
		expect(() => unauthorized()).toThrow("UNAUTHORIZED")
		expect(lastStatus).toBe(401)
	})

	test("forbidden sinaliza 403 e aceita mensagem própria", () => {
		expect(() => forbidden("FORBIDDEN: journal")).toThrow("FORBIDDEN: journal")
		expect(lastStatus).toBe(403)
	})
})
