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
 * resolveUserPermissions une as DUAS origens do modelo — grants inline (`user_permissions`)
 * e statements das políticas anexadas (`user_policy_attachment` → `policy_statement`) —,
 * injeta o implicit allow ("diner") e aplica precedência de deny. É a mesma resolução que o
 * app do sisub usa: quem recebe acesso por política gerenciada é autorizado aqui também.
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
		const permissions = await resolveUserPermissions(user.id, getDataClient("access_control"))
		return {
			userId: user.id,
			permissions,
			// Garantia no PISO, mesmo com JWT de sessão: o token chega aqui por cabeçalho de um
			// cliente MCP, e ler `aal` dele elevaria a execução de um agente com a prova de
			// identidade que a pessoa deu ao navegador. Nenhuma tool do MCP é operação
			// classificada; se um dia for, tem que ser barrada — e é este piso que barra.
			aal: 1,
			lastFactorAt: null,
			origin: "session",
			hasVerifiedFactor: (user.factors ?? []).some((factor) => factor.status === "verified"),
		}
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
 * Lança McpError se a chave for inválida, revogada ou VENCIDA.
 */
export async function resolveApiKey(rawKey: string): Promise<UserContext> {
	if (!rawKey.startsWith("smcp_")) {
		throw new McpError(ErrorCode.InvalidRequest, "API key inválida")
	}

	const hash = await sha256hex(rawKey)
	const db = getDataClient("access_control")

	const { data, error } = await db.from("mcp_api_keys").select("user_id, expires_at").eq("key_hash", hash).eq("is_active", true).single()

	if (error || !data) {
		throw new McpError(ErrorCode.InvalidRequest, "API key inválida ou revogada")
	}

	// Prazo: a chave vencida é recusada AQUI, antes de carregar permissão nenhuma.
	//
	// O filtro poderia estar no `where` (`.gt("expires_at", agora)`), e a chave vencida cairia
	// como "inválida ou revogada". A mensagem separada existe porque quem lê isto é um cliente
	// MCP configurado por uma pessoa: "inválida" manda conferir o que foi colado; "vencida em
	// 12/09" manda gerar outra, que é a ação certa. Diagnóstico errado custa uma tarde.
	//
	// `expires_at` ausente ou ilegível falha FECHADO. A coluna é `not null` desde a migration
	// de prazo; ausência aqui significa banco fora do formato esperado, e o desfecho seguro
	// numa credencial permanente é recusar, não presumir prazo infinito — que é exatamente o
	// estado que esta mudança fecha.
	const expiresAt = data.expires_at ? Date.parse(data.expires_at) : Number.NaN
	if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
		throw new McpError(
			ErrorCode.InvalidRequest,
			`API key vencida${Number.isFinite(expiresAt) ? ` em ${new Date(expiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}. Gere uma nova em Chaves de API (MCP), no SISUB.`
		)
	}

	// Fire-and-forget: atualizar last_used_at sem bloquear
	void db.from("mcp_api_keys").update({ last_used_at: new Date().toISOString() }).eq("key_hash", hash)

	try {
		const permissions = await resolveUserPermissions(data.user_id, db)
		return {
			userId: data.user_id,
			permissions,
			// Credencial de prazo longo, sem senha e sem segundo fator: `aal: 1` e
			// `origin: "api-key"` fazem dela algo que NUNCA satisfaz exigência de garantia
			// (design.md D11). Até aqui a chave executava em nome do dono tudo que o step-up
			// deveria proteger.
			aal: 1,
			lastFactorAt: null,
			origin: "api-key",
			// A chave não carrega a lista de fatores do dono, e não é ela que vai apresentar
			// nenhum: declarar `false` mantém o contexto completo sem fingir conhecimento. Não
			// muda desfecho — `assertAssurance` barra a origem `api-key` antes de chegar aqui.
			hasVerifiedFactor: false,
		}
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
