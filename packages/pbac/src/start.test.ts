import { afterEach, describe, expect, mock, test } from "bun:test"
import type { User } from "@supabase/supabase-js"
import { AssuranceRequiredError } from "./errors.ts"

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

const { assuranceRequired, createRequestAuth, forbidden, unauthorized } = await import("./start.ts")

const fakeUser = (id = "u-1") => ({ id, email: `${id}@fab.mil.br` }) as User

/**
 * Monta um access token de verdade (assinatura falsa — a leitura de claims é local e sem
 * verificação, por decisão registrada em V3).
 */
function accessToken(payload: Record<string, unknown>): string {
	const base64url = (value: string) => btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
	return [base64url(JSON.stringify({ alg: "HS256" })), base64url(JSON.stringify(payload)), "assinatura-nao-verificada"].join(".")
}

/** Client de auth que conta quantas vezes o JWT foi validado de fato. */
function authClientSpy(user: User | null, delayMs = 0, accessTokenValue?: string) {
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
				getSession: async () => ({ data: { session: accessTokenValue ? { access_token: accessTokenValue } : null } }),
			},
		}),
	}
}

/** Client de permissões que devolve as linhas cruas de `user_permissions`. */
// biome-ignore lint/suspicious/noExplicitAny: dublê mínimo do SupabaseClient
function permissionsClient(rows: Array<Record<string, unknown>>): any {
	return {
		// A resolução também sonda `user_policy_attachment`; sem política anexada esse
		// caminho para na primeira query. Ver `resolve-permissions.test.ts`.
		from: (table: string) => ({
			select: () => ({
				// `.or(...)` é o filtro de expiração de `resolveUserPermissions`; o dublê precisa
				// tê-lo, senão a cadeia quebra antes de devolver as linhas.
				eq: () => ({ or: async () => ({ data: table === "user_permissions" ? rows : [], error: null }) }),
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
			getPermissionsClient: () => permissionsClient([{ module: "sucont-4", level: 2 }]),
		})

		const ctx = await auth.requireLevel("sucont-4", 2)
		expect(ctx.userId).toBe("u-1")
	})

	test("requireLevel sinaliza 403 quando o nível é insuficiente", async () => {
		currentRequest = new Request("https://app.local/")
		const auth = createRequestAuth({
			getAuthClient: authClientSpy(fakeUser()).client,
			getPermissionsClient: () => permissionsClient([{ module: "sucont-4", level: 1 }]),
		})

		expect(auth.requireLevel("sucont-4", 2)).rejects.toThrow("FORBIDDEN: sucont-4")
		await auth.requireLevel("sucont-4", 2).catch(() => {})
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

		await auth.requireLevel("sucont-4", 1).catch(() => {})
		expect(lastStatus).toBe(401)
		expect(permissionsRead).toBe(false)
	})

	test("mensagem do app substitui o default — ela chega ao usuário na tela", async () => {
		currentRequest = new Request("https://app.local/")
		const auth = createRequestAuth({
			getAuthClient: authClientSpy(null).client,
			messages: { unauthorized: "Não autenticado." },
		})

		// O portal renderiza `err.message` direto em cinco telas do journal: um
		// default em inglês vazando para lá é regressão visível, não detalhe interno.
		expect(auth.requireUserId()).rejects.toThrow("Não autenticado.")
	})

	test("mensagem de 403 do app substitui o default", async () => {
		currentRequest = new Request("https://app.local/")
		const auth = createRequestAuth({
			getAuthClient: authClientSpy(fakeUser()).client,
			getPermissionsClient: () => permissionsClient([{ module: "sucont-4", level: 1 }]),
			messages: { forbidden: (m) => `Sem acesso ao módulo ${m}.` },
		})

		expect(auth.requireLevel("sucont-4", 2)).rejects.toThrow("Sem acesso ao módulo sucont-4.")
	})

	test("requireAnyLevel passa quando UM dos módulos concede", async () => {
		currentRequest = new Request("https://app.local/")
		const auth = createRequestAuth({
			getAuthClient: authClientSpy(fakeUser()).client,
			getPermissionsClient: () => permissionsClient([{ module: "sucont-3", level: 1 }]),
		})

		const ctx = await auth.requireAnyLevel(["sucont-3", "sucont-4"], 1)
		expect(ctx.userId).toBe("u-1")
	})

	test("requireAnyLevel sinaliza 403 e nomeia os módulos quando nenhum concede", async () => {
		currentRequest = new Request("https://app.local/")
		const auth = createRequestAuth({
			getAuthClient: authClientSpy(fakeUser()).client,
			getPermissionsClient: () => permissionsClient([{ module: "sucont-1", level: 2 }]),
		})

		expect(auth.requireAnyLevel(["sucont-3", "sucont-4"], 1)).rejects.toThrow("FORBIDDEN: sucont-3 | sucont-4")
		await auth.requireAnyLevel(["sucont-3", "sucont-4"], 1).catch(() => {})
		expect(lastStatus).toBe(403)
	})

	test("requireAnyLevel cobra o nível em cada módulo, não somado entre eles", async () => {
		// Ter leitura em duas divisões não é ter escrita em nenhuma.
		currentRequest = new Request("https://app.local/")
		const auth = createRequestAuth({
			getAuthClient: authClientSpy(fakeUser()).client,
			getPermissionsClient: () =>
				permissionsClient([
					{ module: "sucont-3", level: 1 },
					{ module: "sucont-4", level: 1 },
				]),
		})

		expect(auth.requireAnyLevel(["sucont-3", "sucont-4"], 2)).rejects.toThrow("FORBIDDEN")
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

describe("createRequestAuth — garantia de identidade no contexto", () => {
	/** Contexto resolvido com um token de sessão arbitrário. */
	async function contextFor(payload: Record<string, unknown> | null, user: User = fakeUser()) {
		currentRequest = new Request("https://app.local/")
		const auth = createRequestAuth({
			getAuthClient: authClientSpy(user, 0, payload ? accessToken(payload) : undefined).client,
			getPermissionsClient: () => permissionsClient([{ module: "unit", level: 2 }]),
		})
		return auth.requireAuth()
	}

	test("sessão elevada popula aal, origem e o instante do fator", async () => {
		const ctx = await contextFor({ sub: "u-1", aal: "aal2", amr: [{ method: "totp", timestamp: 1789137344 }] })
		expect(ctx.aal).toBe(2)
		expect(ctx.lastFactorAt).toBe(1789137344)
		expect(ctx.origin).toBe("session")
	})

	test("refresh de token não renova a elevação", async () => {
		const ctx = await contextFor({
			sub: "u-1",
			aal: "aal2",
			amr: [
				{ method: "token_refresh", timestamp: 1789199999 },
				{ method: "totp", timestamp: 1789137344 },
			],
		})
		expect(ctx.lastFactorAt).toBe(1789137344)
	})

	test("claim `aal` ausente vira AAL1", async () => {
		const ctx = await contextFor({ sub: "u-1" })
		expect(ctx.aal).toBe(1)
		expect(ctx.lastFactorAt).toBeNull()
	})

	test("sem sessão legível o contexto fica no piso, sem lançar", async () => {
		// Falha de leitura de claim rebaixa a garantia; ela NÃO derruba um request que a
		// autenticação já aprovou.
		const ctx = await contextFor(null)
		expect(ctx.aal).toBe(1)
		expect(ctx.userId).toBe("u-1")
	})

	test("token de OUTRO usuário é descartado — elevação não atravessa contas", async () => {
		// Troca de conta numa aba paralela entre o getUser() e o getSession(). Ler a garantia
		// do token errado atribuiria a elevação de um usuário a outro.
		const ctx = await contextFor({ sub: "u-outro", aal: "aal2", amr: [{ method: "totp", timestamp: 1789137344 }] })
		expect(ctx.aal).toBe(1)
		expect(ctx.lastFactorAt).toBeNull()
	})

	test("o AAL vem do TOKEN, nunca do payload da server function", async () => {
		// O cliente manda `aal: 2` no corpo da requisição de uma sessão AAL1. `requireAuth()`
		// não recebe payload nenhum — é a razão estrutural de o cenário da spec ser
		// impossível, e não uma checagem que alguém possa remover sem reprovar a suíte.
		currentRequest = new Request("https://app.local/", {
			method: "POST",
			body: JSON.stringify({ aal: 2, amr: [{ method: "totp", timestamp: 1789199999 }] }),
		})
		const auth = createRequestAuth({
			getAuthClient: authClientSpy(fakeUser(), 0, accessToken({ sub: "u-1" })).client,
			getPermissionsClient: () => permissionsClient([{ module: "unit", level: 2 }]),
		})
		const ctx = await auth.requireAuth()
		expect(ctx.aal).toBe(1)
		expect(ctx.lastFactorAt).toBeNull()
	})

	test("só fator VERIFICADO conta como fator cadastrado", async () => {
		const comFator = { ...fakeUser(), factors: [{ id: "f1", status: "verified" }] } as unknown as User
		const semFator = { ...fakeUser(), factors: [{ id: "f1", status: "unverified" }] } as unknown as User
		expect((await contextFor({ sub: "u-1" }, comFator)).hasVerifiedFactor).toBe(true)
		expect((await contextFor({ sub: "u-1" }, semFator)).hasVerifiedFactor).toBe(false)
	})
})

describe("createRequestAuth — piso de garantia nos gates", () => {
	function authFor(payload: Record<string, unknown>) {
		currentRequest = new Request("https://app.local/")
		return createRequestAuth({
			getAuthClient: authClientSpy(fakeUser(), 0, accessToken(payload)).client,
			getPermissionsClient: () => permissionsClient([{ module: "sucont-4", level: 2 }]),
		})
	}

	const FRESH = { require: "fresh", reason: "Esta operação altera permissões de acesso." } as const
	const SESSION = { require: "session", reason: "Esta operação registra uma liquidação." } as const

	test("sem o parâmetro, o gate é exatamente o de antes desta mudança", async () => {
		const ctx = await authFor({ sub: "u-1" }).requireLevel("sucont-4", 2)
		expect(ctx.userId).toBe("u-1")
	})

	test("piso `session` barra sessão AAL1 e sinaliza 403", async () => {
		const auth = authFor({ sub: "u-1" })
		await auth.requireLevel("sucont-4", 2, undefined, SESSION).catch(() => {})
		expect(lastStatus).toBe(403)
		await expect(auth.requireLevel("sucont-4", 2, undefined, SESSION)).rejects.toThrow("Esta operação registra uma liquidação.")
	})

	test("piso `session` passa em sessão AAL2", async () => {
		const auth = authFor({ sub: "u-1", aal: "aal2", amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) - 3600 }] })
		const ctx = await auth.requireLevel("sucont-4", 2, undefined, SESSION)
		expect(ctx.aal).toBe(2)
	})

	test("piso `fresh` rejeita elevação vencida", async () => {
		const auth = authFor({ sub: "u-1", aal: "aal2", amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) - 40 * 60 }] })
		const error = await auth.requireLevel("sucont-4", 2, undefined, FRESH).catch((e) => e)
		expect(error.code).toBe("MFA_REQUIRED")
		expect(error.nextStep).toBe("step-up")
	})

	test("sem permissão NÃO vira pedido de elevação", async () => {
		// A ordem é o requisito: o gate de módulo/nível vem primeiro. Invertê-lo faria alguém
		// sem permissão nenhuma receber um desafio de segundo fator por uma tela que ele não
		// alcança — e ainda revelaria que a operação existe.
		currentRequest = new Request("https://app.local/")
		const auth = createRequestAuth({
			getAuthClient: authClientSpy(fakeUser(), 0, accessToken({ sub: "u-1" })).client,
			getPermissionsClient: () => permissionsClient([{ module: "sucont-4", level: 1 }]),
		})
		await expect(auth.requireLevel("sucont-4", 2, undefined, FRESH)).rejects.toThrow("FORBIDDEN: sucont-4")
	})

	test("requireAnyLevel aplica o mesmo piso", async () => {
		currentRequest = new Request("https://app.local/")
		const auth = createRequestAuth({
			getAuthClient: authClientSpy(fakeUser(), 0, accessToken({ sub: "u-1" })).client,
			getPermissionsClient: () => permissionsClient([{ module: "sucont-3", level: 2 }]),
		})
		await expect(auth.requireAnyLevel(["sucont-3", "sucont-4"], 2, undefined, SESSION)).rejects.toThrow("Esta operação registra uma liquidação.")
		const ctx = await auth.requireAnyLevel(["sucont-3", "sucont-4"], 2)
		expect(ctx.userId).toBe("u-1")
	})
})

describe("assuranceRequired", () => {
	test("sinaliza 403 e preserva o erro tipado inteiro", () => {
		const error = new AssuranceRequiredError({
			nextStep: "step-up",
			reason: "Esta operação altera permissões de acesso.",
			grade: "fresh",
			origin: "session",
		})
		expect(() => assuranceRequired(error)).toThrow(error)
		expect(lastStatus).toBe(403)
	})
})
