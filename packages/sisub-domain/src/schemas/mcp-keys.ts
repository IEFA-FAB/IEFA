import { z } from "zod"
import { UuidSchema } from "./common.ts"

/**
 * Chaves de API do servidor MCP (`access_control.mcp_api_keys`).
 *
 * Nenhum schema aqui carrega `userId`: o dono é SEMPRE o da sessão (`ctx.userId`).
 * Aceitar o dono no input seria o IDOR que `fetchUserPermissionsFn` já teve.
 */

export const CreateMcpApiKeySchema = z.object({
	label: z.string().min(1).max(100),
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
