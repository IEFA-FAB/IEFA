import type { core } from "zod"

/**
 * Hierarquia de erros do domínio, igual à do `sisub-domain`: a operation lança, a server
 * function traduz (`handleDomainError`) em status HTTP e mensagem para o cliente.
 */
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

/** O que o cliente lê quando o banco falha e ninguém escreveu mensagem melhor. */
export const GENERIC_DB_ERROR_MESSAGE = "Não foi possível concluir a operação no banco de dados. Tente novamente."

/**
 * Falha do banco ou do driver convertida em erro de domínio. `message` carrega o diagnóstico
 * inteiro (SQL, parâmetros, SQLSTATE) e é para LOG; quem responde ao cliente usa
 * `publicMessage`. O erro original fica em `cause`, não enumerável.
 */
export class QueryFailedError extends DomainError {
	constructor(
		code: string,
		message: string,
		public readonly publicMessage: string = GENERIC_DB_ERROR_MESSAGE,
		cause?: unknown
	) {
		super(code, message)
		this.name = "QueryFailedError"
		if (cause !== undefined) Object.defineProperty(this, "cause", { value: cause, enumerable: false, writable: true, configurable: true })
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
		public readonly issues: core.$ZodIssue[]
	) {
		super("VALIDATION_FAILED", message)
		this.name = "ValidationError"
		Object.setPrototypeOf(this, new.target.prototype)
	}
}
