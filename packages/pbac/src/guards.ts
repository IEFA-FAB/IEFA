import { PermissionDeniedError } from "./errors.ts"
import { hasPermission } from "./has-permission.ts"
import type { AppModule, PermissionScope, UserContext } from "./types.ts"

/** Níveis suportados: 1=leitura, 2=escrita, 3=administração. */
export type MinLevel = 1 | 2 | 3

/**
 * Exige que o contexto conceda `module` no nível mínimo (com escopo opcional).
 * Lança {@link PermissionDeniedError} caso contrário.
 *
 * Guard genérico e agnóstico de app para novos consumidores (rumaer + futuro app
 * central de permissões). O sisub-domain mantém o seu próprio guard integrado à
 * hierarquia `DomainError`; ambos compartilham a engine `hasPermission`.
 */
export function requirePermission(ctx: UserContext, module: AppModule, minLevel: MinLevel = 1, scope?: PermissionScope): void {
	if (!hasPermission(ctx.permissions, module, minLevel, scope)) {
		throw new PermissionDeniedError(module, minLevel, scope)
	}
}

/**
 * Passa se o contexto conceder QUALQUER um dos módulos no nível mínimo.
 * Para recursos que mais de um módulo legitimamente acessa.
 */
export function requireAnyPermission(ctx: UserContext, modules: readonly AppModule[], minLevel: MinLevel = 1, scope?: PermissionScope): void {
	if (!modules.some((m) => hasPermission(ctx.permissions, m, minLevel, scope))) {
		throw new PermissionDeniedError(modules.join(" | "), minLevel, scope)
	}
}
