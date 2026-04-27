import type { ZodIssue } from "zod"

export class DomainError extends Error {
	constructor(
		public readonly code: string,
		message: string,
		public readonly details?: unknown
	) {
		super(message)
		this.name = "DomainError"
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class PermissionDeniedError extends DomainError {
	constructor(module: string, level: number, scope?: { type: string; id?: number }) {
		const scopeDesc = scope ? ` (${scope.type}${scope.id !== undefined ? `:${scope.id}` : ""})` : ""
		super("PERMISSION_DENIED", `Requires ${module} level ${level}${scopeDesc}`)
		this.name = "PermissionDeniedError"
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class NotFoundError extends DomainError {
	constructor(entity: string, id: string | number) {
		super("NOT_FOUND", `${entity} ${id} not found`)
		this.name = "NotFoundError"
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export class ValidationError extends DomainError {
	constructor(
		message: string,
		public readonly issues: ZodIssue[]
	) {
		super("VALIDATION_FAILED", message)
		this.name = "ValidationError"
		Object.setPrototypeOf(this, new.target.prototype)
	}
}
