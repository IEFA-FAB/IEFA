/**
 * Auth module: valida credencial (API key ou JWT) e carrega permissões PBAC.
 *
 * Flow — API key (smcp_xxx):
 *   SHA-256(rawKey) → mcp_api_keys WHERE key_hash=? AND is_active=true
 *   → resolveUserPermissions(userId, dataClient) via @iefa/pbac
 *   → UserContext { userId, permissions }
 *
 * Flow — JWT Supabase:
 *   authClient.auth.getUser(jwt) — valida assinatura e expiração
 *   → resolveUserPermissions(userId, dataClient) via @iefa/pbac
 *   → UserContext { userId, permissions }
 *
 * resolveUserPermissions aplica implicit allow ("diner") e strip de deny (level 0).
 */

import { resolveUserPermissions } from "@iefa/pbac"
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js"
import { getAuthClient, getDataClient } from "./supabase.ts"
import type { UserContext } from "./types.ts"

// ---------------------------------------------------------------------------
// sha256hex — helper interno
// ---------------------------------------------------------------------------

async function sha256hex(input: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}

// ---------------------------------------------------------------------------
// resolveUserContext — JWT Supabase
// ---------------------------------------------------------------------------

/**
 * Valida o JWT do usuário e carrega permissões PBAC.
 * Lança McpError se o token for inválido ou expirado.
 */
export async function resolveUserContext(jwt: string): Promise<UserContext> {
	if (!jwt) {
		throw new McpError(ErrorCode.InvalidRequest, "JWT não fornecido. Passe Authorization: Bearer <token>")
	}

	const {
		data: { user },
		error: authError,
	} = await getAuthClient().auth.getUser(jwt)

	if (authError || !user) {
		throw new McpError(ErrorCode.InvalidRequest, "Token JWT inválido ou expirado")
	}

	try {
		const permissions = await resolveUserPermissions(user.id, getDataClient())
		return { userId: user.id, permissions }
	} catch (err) {
		// M3: não expor detalhes internos ao cliente
		process.stderr.write(`[sisub-mcp] Erro ao carregar permissões (jwt) user=${user.id}: ${err}\n`)
		throw new McpError(ErrorCode.InternalError, "Erro interno ao carregar permissões. Tente novamente.")
	}
}

// ---------------------------------------------------------------------------
// resolveApiKey — API key smcp_xxx
// ---------------------------------------------------------------------------

/**
 * Autentica uma API key e carrega permissões PBAC do dono.
 * Atualiza last_used_at de forma assíncrona (fire-and-forget).
 * Lança McpError se a chave for inválida ou revogada.
 */
export async function resolveApiKey(rawKey: string): Promise<UserContext> {
	if (!rawKey.startsWith("smcp_")) {
		throw new McpError(ErrorCode.InvalidRequest, "API key inválida")
	}

	const hash = await sha256hex(rawKey)
	const db = getDataClient()

	const { data, error } = await db.from("mcp_api_keys").select("user_id").eq("key_hash", hash).eq("is_active", true).single()

	if (error || !data) {
		throw new McpError(ErrorCode.InvalidRequest, "API key inválida ou revogada")
	}

	// Fire-and-forget: atualizar last_used_at sem bloquear
	void db.from("mcp_api_keys").update({ last_used_at: new Date().toISOString() }).eq("key_hash", hash)

	try {
		const permissions = await resolveUserPermissions(data.user_id, db)
		return { userId: data.user_id, permissions }
	} catch (err) {
		process.stderr.write(`[sisub-mcp] Erro ao carregar permissões (api-key) user=${data.user_id}: ${err}\n`)
		throw new McpError(ErrorCode.InternalError, "Erro interno ao carregar permissões. Tente novamente.")
	}
}

// ---------------------------------------------------------------------------
// resolveCredential — dispatcher
// ---------------------------------------------------------------------------

/**
 * Auto-detecta o tipo de credencial e resolve o UserContext.
 *   smcp_xxx → resolveApiKey
 *   qualquer outro valor → resolveUserContext (JWT)
 */
export async function resolveCredential(credential: string): Promise<UserContext> {
	if (credential.startsWith("smcp_")) {
		return resolveApiKey(credential)
	}
	return resolveUserContext(credential)
}
