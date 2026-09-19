/**
 * @module error-handler
 * Converts DomainError subclasses to MCP toolError responses.
 * Never exposes internal details (M3).
 */

import { DomainError, NotFoundError, PermissionDeniedError, QueryFailedError } from "@iefa/sisub-domain/types"
import { toolError } from "../tools/shared.ts"

export function handleToolError(error: unknown): ReturnType<typeof toolError> {
	if (error instanceof PermissionDeniedError) {
		return toolError("Permissão insuficiente para esta operação")
	}
	if (error instanceof NotFoundError) {
		return toolError("Recurso não encontrado")
	}
	// Falha de banco: `message` tem SQL e parâmetros (diagnóstico) — vai para o log; o modelo
	// lê só a mensagem pública.
	if (error instanceof QueryFailedError) {
		process.stderr.write(`[sisub-mcp] Query failed (${error.code}): ${error.message}\n`)
		return toolError(error.publicMessage)
	}
	if (error instanceof DomainError) {
		return toolError(error.message)
	}
	// M3: never expose internal details
	process.stderr.write(`[sisub-mcp] Unhandled error: ${error}\n`)
	return toolError("Erro interno — tente novamente")
}
