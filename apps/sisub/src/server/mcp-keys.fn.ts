/**
 * @module mcp-keys.fn
 * Wrappers finos sobre as operations de `@iefa/sisub-domain` (Drizzle).
 * Todas as operações são escopadas ao usuário autenticado — o dono sai de `ctx.userId`,
 * nunca do payload. A chave real (rawKey) é retornada APENAS em createMcpKeyFn.
 *
 * Criar, revogar e apagar uma chave são registrados no log de operações sensíveis na MESMA
 * transação da escrita (`withAtomicAudit`, migration 20260921130000) — inclusive revogar e
 * apagar, que são `"none"` no registro de garantia (não exigem segundo fator: retirar uma
 * credencial vazada não pode esperar), mas são retirada de credencial e ficam registradas.
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
import { withAtomicAudit } from "@/lib/audit.server"
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
 *
 * O log (mesma transação) guarda id, rótulo, prefixo e PRAZO da chave — nunca o segredo nem o
 * hash. O prazo é metade do que a chave É: uma investigação que vê "chave criada" sem ver até
 * quando ela vale não responde se a credencial ainda estava viva no dia do incidente.
 */
export const createMcpKeyFn = createServerFn({ method: "POST" })
	.validator(CreateMcpApiKeySchema)
	.handler(async ({ data }): Promise<{ key: string; row: McpApiKey }> => {
		const ctx = await requireAuth()
		return withAtomicAudit("createMcpKeyFn", ({ assurance, audit }) => createMcpApiKey(getDb(), ctx, data, assurance, audit)).catch(handleDomainError)
	})

/** Revoga (desativa) uma chave do próprio usuário. A linha permanece para auditoria. */
export const revokeMcpKeyFn = createServerFn({ method: "POST" })
	.validator(RevokeMcpApiKeySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		await withAtomicAudit("revokeMcpKeyFn", ({ audit }) => revokeMcpApiKey(getDb(), ctx, data, audit)).catch(handleDomainError)
		return { success: true }
	})

/** Remove permanentemente uma chave do próprio usuário. O log guarda o que ela era. */
export const deleteMcpKeyFn = createServerFn({ method: "POST" })
	.validator(DeleteMcpApiKeySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		await withAtomicAudit("deleteMcpKeyFn", ({ audit }) => deleteMcpApiKey(getDb(), ctx, data, audit)).catch(handleDomainError)
		return { success: true }
	})
