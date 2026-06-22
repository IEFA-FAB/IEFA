import { hasPermission } from "@iefa/pbac"
import type { AppModule, PermissionScope, UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"

export function requirePermission(ctx: UserContext, module: AppModule, minLevel: 1 | 2, scope?: PermissionScope): void {
	if (!hasPermission(ctx.permissions, module, minLevel, scope)) {
		throw new PermissionDeniedError(module, minLevel, scope)
	}
}

/**
 * Passa se o usuário tiver QUALQUER um dos módulos informados no nível mínimo.
 * Para recursos compartilhados que mais de um módulo legitimamente acessa — ex.:
 * o catálogo de insumos, gerido por `global` (SDAB) mas lido/editado por `kitchen`
 * (montagem de receitas). Sem isso, a rota `/global/ingredients` (gate `global`)
 * e as operações do domínio (gate `kitchen`) divergem.
 */
export function requireAnyPermission(ctx: UserContext, modules: readonly AppModule[], minLevel: 1 | 2, scope?: PermissionScope): void {
	if (!modules.some((m) => hasPermission(ctx.permissions, m, minLevel, scope))) {
		throw new PermissionDeniedError(modules.join(" | "), minLevel, scope)
	}
}

export function requireKitchen(ctx: UserContext, level: 1 | 2, kitchenId: number): void {
	requirePermission(ctx, "kitchen", level, { type: "kitchen", id: kitchenId })
}

export function requireUnit(ctx: UserContext, level: 1 | 2, unitId: number): void {
	requirePermission(ctx, "unit", level, { type: "unit", id: unitId })
}

export function requireMessHall(ctx: UserContext, level: 1 | 2, messHallId: number): void {
	requirePermission(ctx, "messhall", level, { type: "mess_hall", id: messHallId })
}
