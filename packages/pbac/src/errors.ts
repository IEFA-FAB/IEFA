import type { PermissionScope } from "./types.ts"

/**
 * Erro puro de autorização negada, sem acoplamento a nenhum app.
 *
 * NÃO estende a hierarquia `DomainError` do sisub-domain de propósito — o pacote
 * `@iefa/pbac` é agnóstico de app. Cada consumidor mapeia este erro para o próprio
 * transporte (ex.: HTTP 403). Distinguível por `instanceof PermissionDeniedError`
 * ou pelo campo `code === "PERMISSION_DENIED"`.
 */
export class PermissionDeniedError extends Error {
	readonly code = "PERMISSION_DENIED" as const

	constructor(
		public readonly module: string,
		public readonly minLevel: number,
		public readonly scope?: PermissionScope
	) {
		const scopeDesc = scope ? ` (${scope.type}:${scope.id})` : ""
		super(`Requires ${module} level ${minLevel}${scopeDesc}`)
		this.name = "PermissionDeniedError"
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

/** O que o usuário precisa fazer para satisfazer a exigência que o barrou. */
export type AssuranceNextStep =
	/** A conta não tem fator nenhum: o caminho é cadastrar um (2 min) e seguir. */
	| "enroll"
	/** Tem fator, sessão em AAL1 (fechou o desafio no login): pedir o código. */
	| "challenge"
	/** Sessão já em AAL2, mas a elevação venceu: pedir o código de novo. */
	| "step-up"

export interface AssuranceRequiredErrorInit {
	nextStep: AssuranceNextStep
	/** Frase que descreve a OPERAÇÃO, exibida no modal de elevação. */
	reason: string
	/** Grau exigido pela operação que barrou. */
	grade: "session" | "fresh"
	/** Origem da credencial barrada — `api-key` nunca satisfaz grau nenhum. */
	origin: "session" | "api-key"
	/** Mensagem final; default é o próprio `reason`. */
	message?: string
}

/**
 * Negativa por GARANTIA DE IDENTIDADE — o usuário tem a permissão, falta provar quem é.
 *
 * É uma classe separada de {@link PermissionDeniedError} porque as duas exigem telas
 * diferentes: "acesso negado" numa operação que a pessoa PODE fazer é o pior desfecho
 * possível de um controle de segurança — ela conclui que o sistema quebrou, abre chamado, e
 * da próxima vez clica em qualquer coisa para passar. Daí `nextStep`: a negativa carrega o
 * caminho de volta.
 *
 * Como `PermissionDeniedError`, NÃO estende a hierarquia `DomainError` do sisub — o pacote é
 * agnóstico de app. Cada consumidor mapeia para o próprio transporte; quem faz isso no
 * TanStack Start é `assuranceRequired()` em `@iefa/pbac/start`.
 */
export class AssuranceRequiredError extends Error {
	readonly code = "MFA_REQUIRED" as const
	readonly nextStep: AssuranceNextStep
	readonly reason: string
	readonly grade: "session" | "fresh"
	readonly origin: "session" | "api-key"

	constructor({ nextStep, reason, grade, origin, message }: AssuranceRequiredErrorInit) {
		super(message ?? reason)
		this.name = "AssuranceRequiredError"
		this.nextStep = nextStep
		this.reason = reason
		this.grade = grade
		this.origin = origin
		Object.setPrototypeOf(this, new.target.prototype)
	}
}
