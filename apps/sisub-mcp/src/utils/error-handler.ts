/**
 * @module error-handler
 * Converts DomainError subclasses to MCP toolError responses.
 * Never exposes internal details (M3).
 */

import { DomainError, NotFoundError, PermissionDeniedError } from "@iefa/sisub-domain/types"
import { toolError } from "../tools/shared.ts"

export function handleToolError(error: unknown): ReturnType<typeof toolError> {
	if (error instanceof PermissionDeniedError) {
		return toolError("Permissão insuficiente para esta operação")
	}
	if (error instanceof NotFoundError) {
		return toolError("Recurso não encontrado")
	}
	if (error instanceof DomainError) {
		return toolError(error.message)
	}
	// M3: never expose internal details
	process.stderr.write(`[sisub-mcp] Unhandled error: ${error}\n`)
	return toolError("Erro interno — tente novamente")
}
