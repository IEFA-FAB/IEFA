/**
 * @module domain-errors
 * Converts DomainError subclasses to HTTP responses for TanStack Start server functions.
 */

import { DomainError, NotFoundError, PermissionDeniedError } from "@iefa/sisub-domain/types"

export function handleDomainError(error: unknown): never {
	if (error instanceof PermissionDeniedError) {
		throw new Response(null, { status: 403 })
	}
	if (error instanceof NotFoundError) {
		throw new Response(null, { status: 404 })
	}
	if (error instanceof DomainError) {
		throw new Response(error.message, { status: 400 })
	}
	throw error
}
