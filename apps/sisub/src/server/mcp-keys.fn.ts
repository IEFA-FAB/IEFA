/**
 * @module mcp-keys.fn
 * CRUD de chaves de API para o sisub-mcp server.
 * Todas as operações são escopadas ao usuário autenticado via cookie de sessão.
 * A chave real (rawKey) é retornada APENAS em createMcpKeyFn — nunca persistida.
 *
 * Formato da chave: smcp_ + 64 hex chars (32 random bytes)
 * Hash armazenado: SHA-256 (Web Crypto API)
 * Prefix exibido: primeiros 12 chars (smcp_ + 7 hex chars)
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseAuthClient, getSupabaseServerClient } from "@/lib/supabase.server"

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

async function sha256hex(input: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}

async function getCurrentUser() {
	const supabase = getSupabaseAuthClient()
	const {
		data: { user },
	} = await supabase.auth.getUser()
	if (!user) throw new Error("Não autenticado")
	return user
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type McpApiKey = {
	id: string
	label: string
	key_prefix: string
	is_active: boolean
	last_used_at: string | null
	created_at: string
}

// ---------------------------------------------------------------------------
// listMcpKeysFn
// ---------------------------------------------------------------------------

/**
 * Lista todas as chaves de API do usuário autenticado.
 * Ordenadas por criação decrescente.
 */
export const listMcpKeysFn = createServerFn({ method: "GET" }).handler(async (): Promise<McpApiKey[]> => {
	const user = await getCurrentUser()
	const db = getSupabaseServerClient()

	// biome-ignore lint/suspicious/noExplicitAny: mcp_api_keys não está nos tipos gerados ainda
	const { data, error } = await (db as any)
		.from("mcp_api_keys")
		.select("id, label, key_prefix, is_active, last_used_at, created_at")
		.eq("user_id", user.id)
		.order("created_at", { ascending: false })

	if (error) throw new Error(error.message)
	return (data ?? []) as McpApiKey[]
})

// ---------------------------------------------------------------------------
// createMcpKeyFn
// ---------------------------------------------------------------------------

/**
 * Gera uma nova chave de API para o usuário autenticado.
 * Retorna a chave em texto claro UMA ÚNICA VEZ — o hash é o que persiste.
 *
 * @throws {Error} se o usuário não estiver autenticado ou houver falha no banco.
 */
export const createMcpKeyFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ label: z.string().min(1).max(100) }))
	.handler(async ({ data }): Promise<{ key: string; row: McpApiKey }> => {
		const user = await getCurrentUser()

		// Gerar chave: smcp_ + 32 bytes aleatórios em hex (69 chars total)
		const rawBytes = crypto.getRandomValues(new Uint8Array(32))
		const rawHex = Array.from(rawBytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
		const rawKey = `smcp_${rawHex}`
		const keyPrefix = rawKey.slice(0, 12) // "smcp_" + 7 chars

		const hashHex = await sha256hex(rawKey)

		const db = getSupabaseServerClient()
		// biome-ignore lint/suspicious/noExplicitAny: mcp_api_keys não está nos tipos gerados ainda
		const { data: row, error } = await (db as any)
			.from("mcp_api_keys")
			.insert({
				user_id: user.id,
				label: data.label,
				key_hash: hashHex,
				key_prefix: keyPrefix,
			})
			.select("id, label, key_prefix, is_active, last_used_at, created_at")
			.single()

		if (error) throw new Error(error.message)
		return { key: rawKey, row: row as McpApiKey }
	})

// ---------------------------------------------------------------------------
// revokeMcpKeyFn
// ---------------------------------------------------------------------------

/**
 * Revoga (desativa) uma chave de API. A chave permanece no banco para auditoria.
 * Operação escopada ao usuário autenticado — não revoga chaves de outros usuários.
 */
export const revokeMcpKeyFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		const user = await getCurrentUser()
		const db = getSupabaseServerClient()

		// biome-ignore lint/suspicious/noExplicitAny: mcp_api_keys não está nos tipos gerados ainda
		const { error } = await (db as any).from("mcp_api_keys").update({ is_active: false }).eq("id", data.id).eq("user_id", user.id)

		if (error) throw new Error(error.message)
		return { success: true }
	})

// ---------------------------------------------------------------------------
// deleteMcpKeyFn
// ---------------------------------------------------------------------------

/**
 * Remove permanentemente uma chave de API.
 * Operação escopada ao usuário autenticado.
 */
export const deleteMcpKeyFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		const user = await getCurrentUser()
		const db = getSupabaseServerClient()

		// biome-ignore lint/suspicious/noExplicitAny: mcp_api_keys não está nos tipos gerados ainda
		const { error } = await (db as any).from("mcp_api_keys").delete().eq("id", data.id).eq("user_id", user.id)

		if (error) throw new Error(error.message)
		return { success: true }
	})
