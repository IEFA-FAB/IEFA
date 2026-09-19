import type { core } from "zod"

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
 * Falha do banco/driver convertida em erro de domínio (`runQuery` e afins).
 *
 * `message` carrega o diagnóstico inteiro — SQL, parâmetros, SQLSTATE, motivo do driver — e
 * é para LOG. O `DrizzleQueryError` põe `Failed query: <SQL> params: <valores>` na mensagem,
 * e devolvê-la ao navegador (ou a um modelo) entregava a estrutura do banco e os dados do
 * filtro a quem pediu. Quem responde ao cliente usa {@link QueryFailedError.publicMessage}.
 *
 * O erro original fica em `cause` (não enumerável), para o log e para quem depura.
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
		// Não enumerável: não entra em JSON.stringify nem em serialização de erro para o cliente.
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
