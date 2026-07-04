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
