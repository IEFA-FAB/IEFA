/**
 * @module mcp-keys.fn
 * Wrappers finos sobre as operations de `@iefa/sisub-domain` (Drizzle).
 * Todas as operações são escopadas ao usuário autenticado — o dono sai de `ctx.userId`,
 * nunca do payload. A chave real (rawKey) é retornada APENAS em createMcpKeyFn.
 * @domain app
 * @migration done
 */

import {
	CreateMcpApiKeySchema,
	createMcpApiKey,
	DeleteMcpApiKeySchema,
	deleteMcpApiKey,
	listMcpApiKeys,
	type McpApiKeyRow,
	RevokeMcpApiKeySchema,
	revokeMcpApiKey,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

/** Projeção pública da chave (sem `key_hash`) — o contrato que a UI consome. */
export type McpApiKey = McpApiKeyRow

/** Lista as chaves do usuário autenticado, mais recentes primeiro. */
export const listMcpKeysFn = createServerFn({ method: "GET" }).handler(async (): Promise<McpApiKey[]> => {
	const ctx = await requireAuth()
	return listMcpApiKeys(getDb(), ctx).catch(handleDomainError)
})

/**
 * Gera uma nova chave para o usuário autenticado.
 * Retorna a chave em texto claro UMA ÚNICA VEZ — o que persiste é o hash.
 */
export const createMcpKeyFn = createServerFn({ method: "POST" })
	.validator(CreateMcpApiKeySchema)
	.handler(async ({ data }): Promise<{ key: string; row: McpApiKey }> => {
		const ctx = await requireAuth()
		return createMcpApiKey(getDb(), ctx, data).catch(handleDomainError)
	})

/** Revoga (desativa) uma chave do próprio usuário. A linha permanece para auditoria. */
export const revokeMcpKeyFn = createServerFn({ method: "POST" })
	.validator(RevokeMcpApiKeySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		await revokeMcpApiKey(getDb(), ctx, data).catch(handleDomainError)
		return { success: true }
	})

/** Remove permanentemente uma chave do próprio usuário. */
export const deleteMcpKeyFn = createServerFn({ method: "POST" })
	.validator(DeleteMcpApiKeySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		await deleteMcpApiKey(getDb(), ctx, data).catch(handleDomainError)
		return { success: true }
	})
