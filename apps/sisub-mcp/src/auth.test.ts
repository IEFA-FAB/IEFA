import { describe, expect, mock, test } from "bun:test"
import { satisfiesAssurance } from "@iefa/pbac"
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
						select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: rows.mcp_api_keys?.[0] ?? null, error: null }) }) }) }),
						// `last_used_at`: o dublê devolve o builder sem executar nada porque o
						// código de produção também não executa — `void db.from(...).update(...)`
						// nunca chama `.then()`, e o `PostgrestBuilder` só dispara o fetch ali.
						// A escrita nunca aconteceu; isto NÃO é o contrato desejado, é o bug
						// pré-existente que a revisão desta PR encontrou. Corrigi-lo é outra
						// mudança (precisa de sink de erro, senão vira unhandled rejection).
						update: () => ({ eq: () => undefined }),
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

mock.module("./supabase.ts", () => ({
	getDataClient: () => createDataClient(currentTables),
	getAuthClient: () => ({
		auth: {
			getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
		},
	}),
}))

const { resolveApiKey, resolveCredential, resolveUserContext } = await import("./auth.ts")

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
