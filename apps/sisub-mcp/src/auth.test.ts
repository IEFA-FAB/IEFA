import { describe, expect, mock, test } from "bun:test"
import { satisfiesAssurance } from "@iefa/pbac"
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js"
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js"
import type { UserPermission } from "./types.ts"

/**
 * Contrato de autorização do MCP: uma permissão que existe SÓ como statement de política
 * anexada tem que chegar ao `UserContext`, nos dois caminhos de credencial.
 *
 * Enquanto `resolveUserPermissions` lia apenas `user_permissions`, quem recebia acesso pelo
 * "Conjunto Treino" era enxergado pelo app do sisub e ignorado aqui — as tools respondiam
 * "permissão insuficiente" a alguém que a UI mostrava como autorizado.
 */

type Row = Record<string, unknown>

const USER_ID = "11111111-1111-1111-1111-111111111111"
const POLICY_ID = "22222222-2222-2222-2222-222222222222"

/** Statement da política: o único lugar onde `global` nível 2 existe neste usuário. */
const POLICY_STATEMENT: Row = { policy_id: POLICY_ID, module: "global", level: 2, mess_hall_id: null, kitchen_id: null, unit_id: null }

/**
 * Builder encadeável que devolve `rows` seja qual for o recorte pedido.
 *
 * Todo filtro devolve o PRÓPRIO builder, e ele é thenable — como o
 * `PostgrestBuilder` real, que só dispara no `await`. Antes cada tabela tinha a
 * cadeia exata escrita à mão (`select().eq()`), e isso quebrava o teste toda vez
 * que o `@iefa/pbac` acrescentava um filtro: foi o que aconteceu quando
 * `resolveUserPermissions` passou a encadear `.or(NOT_EXPIRED)` — quatro testes
 * caíram com `.or is not a function`, e a falha não dizia nada sobre a causa.
 *
 * Ignorar o recorte é deliberado, e não uma lacuna: quem prova o filtro por
 * usuário, por prazo, por política viva e por anexo é
 * `packages/pbac/src/resolve-permissions.test.ts`, contra a mesma implementação.
 * Aqui o que está sob teste é se o resultado da resolução chega inteiro ao
 * `UserContext` — e o controle negativo lá embaixo é o que impede este dublê de
 * transformar o teste em tautologia.
 */
function rowsBuilder(rows: Row[]) {
	const result = { data: rows, error: null }
	const builder = {
		select: () => builder,
		eq: () => builder,
		or: () => builder,
		in: () => builder,
		is: () => builder,
		// biome-ignore lint/suspicious/noThenProperty: thenable É o contrato aqui — o `PostgrestBuilder` real só dispara a query no `await`, e sem isto o dublê não substitui o client
		then: <T>(onFulfilled?: (value: typeof result) => T, onRejected?: (reason: unknown) => T) => Promise.resolve(result).then(onFulfilled, onRejected),
	}
	return builder
}

/** Dublê do client de dados usado pelos dois caminhos de credencial. */
function createDataClient(rows: Record<string, Row[]>) {
	return {
		from(table: string) {
			switch (table) {
				case "mcp_api_keys":
					return {
						select: () => ({ eq: () => ({ eq: () => ({ single: async () => apiKeyLookup(rows) }) }) }),
						// `last_used_at`: como o `PostgrestBuilder` real, a escrita só "acontece" quando
						// alguém chama `.then()`. Era assim que o `void` antigo passava sem gravar nada.
						update: (values: Row) => ({
							eq: () => ({
								// biome-ignore lint/suspicious/noThenProperty: thenable É o contrato — o builder real só dispara no consumo
								then: <T>(onFulfilled?: (value: { error: { message: string } | null }) => T, onRejected?: (reason: unknown) => T) => {
									lastUsedWrites.push(values)
									return Promise.resolve({ error: lastUsedWriteError }).then(onFulfilled, onRejected)
								},
							}),
						}),
					}
				case "user_permissions":
				case "user_policy_attachment":
				case "policy":
				case "policy_statement":
					return rowsBuilder(rows[table] ?? [])
				default:
					throw new Error(`tabela inesperada na autenticação: ${table}`)
			}
		},
	}
}

/** Prazo bem no futuro: o caminho feliz não pode depender de quando a suíte roda. */
const FAR_FUTURE = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

const API_KEY_ROW: Row = { user_id: USER_ID, expires_at: FAR_FUTURE }

/** Tabelas de um usuário SEM grant inline nenhum e com uma política anexada. */
const policyOnlyTables: Record<string, Row[]> = {
	mcp_api_keys: [API_KEY_ROW],
	user_permissions: [],
	user_policy_attachment: [{ policy_id: POLICY_ID }],
	policy: [{ id: POLICY_ID, deleted_at: null }],
	policy_statement: [POLICY_STATEMENT],
}

/** Controle negativo: mesmo usuário, política NÃO anexada. */
const noPolicyTables: Record<string, Row[]> = {
	mcp_api_keys: [API_KEY_ROW],
	user_permissions: [],
	user_policy_attachment: [],
	policy: [],
	policy_statement: [],
}

let currentTables: Record<string, Row[]> = policyOnlyTables

/** Resposta do GoTrue ao `getUser(jwt)`. Default: token válido. */
type GetUserResult = { data: { user: { id: string } | null }; error: unknown }
const VALID_USER: GetUserResult = { data: { user: { id: USER_ID } }, error: null }
let getUserImpl: () => Promise<GetUserResult> = async () => VALID_USER

/** Resposta do PostgREST ao `.single()` em `mcp_api_keys`. `null` = usa a linha da tabela. */
let apiKeyLookupOverride: { data: Row | null; error: { code: string; message: string } | null } | null = null
function apiKeyLookup(rows: Record<string, Row[]>) {
	return apiKeyLookupOverride ?? { data: rows.mcp_api_keys?.[0] ?? null, error: null }
}

/** Escritas de `last_used_at` efetivamente disparadas, e o erro que o banco devolve a elas. */
let lastUsedWrites: Row[] = []
let lastUsedWriteError: { message: string } | null = null

mock.module("./supabase.ts", () => ({
	getDataClient: () => createDataClient(currentTables),
	getAuthClient: () => ({ auth: { getUser: () => getUserImpl() } }),
}))

const { isCredentialRejected, resolveApiKey, resolveCredential, resolveUserContext } = await import("./auth.ts")

function globalWrite(permissions: UserPermission[]): UserPermission | undefined {
	return permissions.find((p) => p.module === "global" && p.level >= 2)
}

describe("UserContext do MCP inclui permissões vindas de política", () => {
	test("caminho JWT enxerga o statement da política anexada", async () => {
		currentTables = policyOnlyTables

		const ctx = await resolveUserContext("jwt-valido")

		expect(ctx.userId).toBe(USER_ID)
		expect(globalWrite(ctx.permissions)).toEqual({ module: "global", level: 2, mess_hall_id: null, kitchen_id: null, unit_id: null })
	})

	test("caminho da API key smcp_ enxerga o statement da política anexada", async () => {
		currentTables = policyOnlyTables

		const ctx = await resolveApiKey("smcp_chave-de-teste")

		expect(ctx.userId).toBe(USER_ID)
		expect(globalWrite(ctx.permissions)).toBeDefined()
	})

	test("o dispatcher roteia as duas credenciais para a mesma resolução", async () => {
		currentTables = policyOnlyTables

		const byKey = await resolveCredential("smcp_chave-de-teste")
		const byJwt = await resolveCredential("jwt-valido")

		expect(byKey.permissions).toEqual(byJwt.permissions)
	})

	test("sem a política anexada o mesmo usuário NÃO recebe o grant — o teste não é vacuoso", async () => {
		currentTables = noPolicyTables

		const ctx = await resolveApiKey("smcp_chave-de-teste")

		expect(globalWrite(ctx.permissions)).toBeUndefined()
		// Só sobra o comensal implícito, que a resolução injeta para todo usuário válido.
		expect(ctx.permissions).toEqual([{ module: "diner", level: 1, mess_hall_id: null, kitchen_id: null, unit_id: null }])
	})
})

/**
 * Requisito "Credencial de API nunca satisfaz exigência de garantia".
 *
 * O irmão em `assurance.test.ts` prova o despacho; aqui a prova é sobre a FONTE do contexto —
 * a chave nasce sem garantia nenhuma, e é isso que faz a trava lá valer.
 */
describe("chave de API não satisfaz garantia de identidade", () => {
	test("o contexto da chave nasce em AAL1, origem api-key e sem fator", async () => {
		currentTables = policyOnlyTables

		const ctx = await resolveApiKey("smcp_chave-de-teste")

		expect(ctx.aal).toBe(1)
		expect(ctx.origin).toBe("api-key")
		expect(ctx.lastFactorAt).toBeNull()
		expect(ctx.hasVerifiedFactor).toBe(false)
	})

	test("nem `session` nem `fresh` são satisfeitos por chave de API", async () => {
		currentTables = policyOnlyTables

		const ctx = await resolveApiKey("smcp_chave-de-teste")

		expect(satisfiesAssurance(ctx, { require: "session", reason: "r" })).toBe(false)
		expect(satisfiesAssurance(ctx, { require: "fresh", reason: "r" })).toBe(false)
		// Controle: sem exigência, a chave continua operando o que as permissões do dono
		// alcançam — o piso fecha a operação sensível, não o MCP inteiro.
		expect(satisfiesAssurance(ctx, { require: "none" })).toBe(true)
	})

	test("a sessão por JWT também não é elevada dentro do MCP", async () => {
		currentTables = policyOnlyTables

		const ctx = await resolveUserContext("jwt-valido")

		expect(ctx.aal).toBe(1)
		expect(satisfiesAssurance(ctx, { require: "session", reason: "r" })).toBe(false)
	})
})

describe("prazo da chave de API", () => {
	test("chave vencida é recusada, com mensagem que manda gerar outra", async () => {
		currentTables = {
			...policyOnlyTables,
			mcp_api_keys: [{ user_id: USER_ID, expires_at: new Date(Date.now() - 60_000).toISOString() }],
		}

		// "Inválida" mandaria conferir o que foi colado; "vencida" manda gerar outra, que é a
		// ação certa. Diagnóstico errado custa uma tarde de quem configurou o cliente.
		await expect(resolveApiKey("smcp_chave-de-teste")).rejects.toThrow(/vencida/i)
	})

	test("chave sem prazo legível falha FECHADO", async () => {
		// A coluna é `not null` desde a migration de prazo: ausência aqui é banco fora do
		// formato esperado, e presumir validade infinita seria exatamente o estado que esta
		// mudança fecha.
		currentTables = { ...policyOnlyTables, mcp_api_keys: [{ user_id: USER_ID, expires_at: null }] }

		await expect(resolveApiKey("smcp_chave-de-teste")).rejects.toThrow()
	})

	test("chave dentro do prazo segue autenticando", async () => {
		currentTables = policyOnlyTables

		await expect(resolveApiKey("smcp_chave-de-teste")).resolves.toMatchObject({ userId: USER_ID })
	})
})

/**
 * Supabase fora do ar não é credencial ruim. Com o deadline do kit, GoTrue ou PostgREST que não
 * respondem viram erro em segundos; se esse erro saísse como "inválida/revogada", o cliente MCP
 * descartaria uma credencial boa durante a queda, e o log não separaria uma coisa da outra.
 */
describe("indisponibilidade do Supabase não vira credencial inválida", () => {
	async function codeOf(promise: Promise<unknown>): Promise<number | undefined> {
		try {
			await promise
		} catch (err) {
			expect(err).toBeInstanceOf(McpError)
			return (err as McpError).code
		}
		throw new Error("deveria ter lançado")
	}

	test("JWT recusado pelo GoTrue (4xx) é credencial inválida", async () => {
		getUserImpl = async () => ({ data: { user: null }, error: new AuthApiError("invalid JWT", 401, "bad_jwt") })
		try {
			const code = await codeOf(resolveUserContext("jwt-vencido"))
			expect(code).toBe(ErrorCode.InvalidRequest)
		} finally {
			getUserImpl = async () => VALID_USER
		}
	})

	test("deadline ou rede no GoTrue é indisponibilidade, não token ruim", async () => {
		getUserImpl = async () => ({ data: { user: null }, error: new AuthRetryableFetchError("Supabase request timed out after 5000ms", 0) })
		try {
			const promise = resolveUserContext("jwt-valido")
			await expect(promise).rejects.toThrow(/indisponível/)
			await promise.catch((err) => expect(isCredentialRejected(err)).toBe(false))
		} finally {
			getUserImpl = async () => VALID_USER
		}
	})

	test("5xx do GoTrue também é indisponibilidade", async () => {
		getUserImpl = async () => ({ data: { user: null }, error: new AuthApiError("upstream", 502, "unexpected_failure") })
		try {
			expect(await codeOf(resolveUserContext("jwt-valido"))).toBe(ErrorCode.InternalError)
		} finally {
			getUserImpl = async () => VALID_USER
		}
	})

	test("exceção no client de auth é indisponibilidade", async () => {
		getUserImpl = async () => {
			throw new Error("boom")
		}
		try {
			expect(await codeOf(resolveUserContext("jwt-valido"))).toBe(ErrorCode.InternalError)
		} finally {
			getUserImpl = async () => VALID_USER
		}
	})

	test("chave inexistente (PGRST116) é inválida ou revogada", async () => {
		apiKeyLookupOverride = { data: null, error: { code: "PGRST116", message: "0 rows" } }
		try {
			const promise = resolveApiKey("smcp_chave-de-teste")
			await expect(promise).rejects.toThrow(/inválida ou revogada/)
			await promise.catch((err) => expect(isCredentialRejected(err)).toBe(true))
		} finally {
			apiKeyLookupOverride = null
		}
	})

	test("falha de transporte na consulta da chave é indisponibilidade, não revogação", async () => {
		apiKeyLookupOverride = { data: null, error: { code: "", message: "TypeError: Supabase request timed out after 10000ms" } }
		try {
			const promise = resolveApiKey("smcp_chave-de-teste")
			await expect(promise).rejects.toThrow(/indisponível/)
			await promise.catch((err) => expect(isCredentialRejected(err)).toBe(false))
		} finally {
			apiKeyLookupOverride = null
		}
	})
})

describe("last_used_at da chave de API", () => {
	test("a escrita é disparada de fato", async () => {
		currentTables = policyOnlyTables
		lastUsedWrites = []

		await resolveApiKey("smcp_chave-de-teste")

		expect(lastUsedWrites).toHaveLength(1)
		expect(typeof lastUsedWrites[0].last_used_at).toBe("string")
	})

	test("falha na escrita não derruba a autenticação", async () => {
		currentTables = policyOnlyTables
		lastUsedWrites = []
		lastUsedWriteError = { message: "permission denied" }
		try {
			await expect(resolveApiKey("smcp_chave-de-teste")).resolves.toMatchObject({ userId: USER_ID })
			expect(lastUsedWrites).toHaveLength(1)
		} finally {
			lastUsedWriteError = null
		}
	})
})
