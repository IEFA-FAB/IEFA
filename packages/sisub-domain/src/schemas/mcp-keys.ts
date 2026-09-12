import { z } from "zod"
import { UuidSchema } from "./common.ts"

/**
 * Chaves de API do servidor MCP (`access_control.mcp_api_keys`).
 *
 * Nenhum schema aqui carrega `userId`: o dono é SEMPRE o da sessão (`ctx.userId`).
 * Aceitar o dono no input seria o IDOR que `fetchUserPermissionsFn` já teve.
 */

/**
 * Prazos oferecidos na criação, em dias.
 *
 * Três opções, e não um campo livre de data: prazo livre vira "31/12/2099" na primeira vez
 * que alguém tem pressa, e a chave eterna volta pela porta do formulário. 30 dias para o
 * teste que dura uma tarde, 90 para o uso corrente, 365 para a integração que alguém mantém
 * — nenhum deles é "para sempre".
 */
export const MCP_API_KEY_LIFETIME_DAYS = [30, 90, 365] as const
export type McpApiKeyLifetimeDays = (typeof MCP_API_KEY_LIFETIME_DAYS)[number]

export const CreateMcpApiKeySchema = z.object({
	label: z.string().min(1).max(100),
	/**
	 * Prazo de validade, obrigatório. Sem default no schema de propósito: a escolha é do
	 * usuário, e um default aqui silenciaria o campo que a tela existe para perguntar.
	 */
	expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365)]),
})
export type CreateMcpApiKey = z.infer<typeof CreateMcpApiKeySchema>

export const RevokeMcpApiKeySchema = z.object({
	id: UuidSchema,
})
export type RevokeMcpApiKey = z.infer<typeof RevokeMcpApiKeySchema>

export const DeleteMcpApiKeySchema = z.object({
	id: UuidSchema,
})
export type DeleteMcpApiKey = z.infer<typeof DeleteMcpApiKeySchema>
