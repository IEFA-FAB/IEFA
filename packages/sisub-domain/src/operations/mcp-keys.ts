/**
 * Chaves de API do servidor MCP (`access_control.mcp_api_keys`).
 *
 * ## Autorização
 *
 * Não há módulo PBAC aqui: a chave é do USUÁRIO, e todo comando é self-only. O dono nunca
 * chega pelo input — sai de `ctx.userId` e entra no `where` de toda leitura e de toda
 * mutação. Aceitar um `userId` do chamador seria reabrir o IDOR de `fetchUserPermissionsFn`,
 * e com efeito pior: quem passasse o id alheio revogaria ou apagaria a credencial de outro.
 *
 * ## Segredo
 *
 * A chave em claro (`smcp_` + 32 bytes aleatórios em hex) existe uma única vez, no retorno de
 * `createMcpApiKey`. O que persiste é o SHA-256; o prefixo de 12 chars serve só para o usuário
 * reconhecer a linha na lista.
 */

import { mcpApiKeysInAccessControl, type SisubDb } from "@iefa/database/drizzle/sisub"
import { and, desc, eq } from "drizzle-orm"
import type { CreateMcpApiKey, DeleteMcpApiKey, RevokeMcpApiKey } from "../schemas/mcp-keys.ts"
import type { UserContext } from "../types/context.ts"
import { insertOneOrFail, mutateOrFail, runQuery } from "../utils/index.ts"

/** Projeção pública da chave — `key_hash` NUNCA sai daqui. */
export type McpApiKeyRow = {
	id: string
	label: string
	key_prefix: string
	is_active: boolean
	last_used_at: string | null
	created_at: string
}

const MCP_API_KEY_COLS = {
	id: mcpApiKeysInAccessControl.id,
	label: mcpApiKeysInAccessControl.label,
	key_prefix: mcpApiKeysInAccessControl.keyPrefix,
	is_active: mcpApiKeysInAccessControl.isActive,
	last_used_at: mcpApiKeysInAccessControl.lastUsedAt,
	created_at: mcpApiKeysInAccessControl.createdAt,
} as const

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}

async function sha256hex(input: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
	return toHex(new Uint8Array(buf))
}

/** Predicado self-only: a linha só é alcançável se pertencer à sessão. */
function ownedBySession(keyId: string, userId: string) {
	return and(eq(mcpApiKeysInAccessControl.id, keyId), eq(mcpApiKeysInAccessControl.userId, userId))
}

export async function listMcpApiKeys(db: SisubDb, ctx: UserContext): Promise<McpApiKeyRow[]> {
	return runQuery("FETCH_FAILED", () =>
		db
			.select(MCP_API_KEY_COLS)
			.from(mcpApiKeysInAccessControl)
			.where(eq(mcpApiKeysInAccessControl.userId, ctx.userId))
			.orderBy(desc(mcpApiKeysInAccessControl.createdAt))
	)
}

export async function createMcpApiKey(db: SisubDb, ctx: UserContext, input: CreateMcpApiKey): Promise<{ key: string; row: McpApiKeyRow }> {
	const rawKey = `smcp_${toHex(crypto.getRandomValues(new Uint8Array(32)))}`
	const keyPrefix = rawKey.slice(0, 12) // "smcp_" + 7 chars
	// Hash FORA do `insertOneOrFail`: falha de Web Crypto não é falha de insert e não deve
	// chegar ao chamador com o código de erro do banco.
	const keyHash = await sha256hex(rawKey)

	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(mcpApiKeysInAccessControl)
			.values({
				userId: ctx.userId,
				label: input.label,
				keyHash,
				keyPrefix,
			})
			.returning(MCP_API_KEY_COLS)
	)

	return { key: rawKey, row }
}

export async function revokeMcpApiKey(db: SisubDb, ctx: UserContext, input: RevokeMcpApiKey): Promise<void> {
	// A linha permanece no banco (auditoria) — revogar é só desligar `is_active`.
	await mutateOrFail("REVOKE_FAILED", `mcp_api_key ${input.id} not found`, () =>
		db.update(mcpApiKeysInAccessControl).set({ isActive: false }).where(ownedBySession(input.id, ctx.userId)).returning({ id: mcpApiKeysInAccessControl.id })
	)
}

export async function deleteMcpApiKey(db: SisubDb, ctx: UserContext, input: DeleteMcpApiKey): Promise<void> {
	// Hard delete: a tabela não tem `deleted_at`, e a chave revogada já cobre o caso de
	// auditoria. Quem apaga escolheu não guardar o registro.
	await mutateOrFail("DELETE_FAILED", `mcp_api_key ${input.id} not found`, () =>
		db.delete(mcpApiKeysInAccessControl).where(ownedBySession(input.id, ctx.userId)).returning({ id: mcpApiKeysInAccessControl.id })
	)
}
