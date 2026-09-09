import { describe, expect, mock, test } from "bun:test"
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
 * Dublê do client de dados, com a cadeia exata de cada tabela. Os filtros são ignorados —
 * quem prova o recorte por usuário, por política viva e por anexo é
 * `packages/pbac/src/resolve-permissions.test.ts`. Aqui o que está sob teste é se o
 * resultado da resolução chega inteiro ao `UserContext`.
 */
function createDataClient(rows: Record<string, Row[]>) {
	const listOf = (table: string) => ({ data: rows[table] ?? [], error: null })

	return {
		from(table: string) {
			switch (table) {
				case "mcp_api_keys":
					return {
						select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: rows.mcp_api_keys?.[0] ?? null, error: null }) }) }) }),
						// `last_used_at` é fire-and-forget: o resultado nunca é aguardado.
						update: () => ({ eq: () => undefined }),
					}
				case "user_permissions":
				case "user_policy_attachment":
					return { select: () => ({ eq: async () => listOf(table) }) }
				case "policy":
					return { select: () => ({ in: () => ({ is: async () => listOf(table) }) }) }
				case "policy_statement":
					return { select: () => ({ in: async () => listOf(table) }) }
				default:
					throw new Error(`tabela inesperada na autenticação: ${table}`)
			}
		},
	}
}

const API_KEY_ROW: Row = { user_id: USER_ID }

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
