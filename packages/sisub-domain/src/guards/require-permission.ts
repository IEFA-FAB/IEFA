import { hasPermission } from "@iefa/pbac"
import type { AppModule, PermissionScope, UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"

export function requirePermission(ctx: UserContext, module: AppModule, minLevel: 1 | 2, scope?: PermissionScope): void {
	if (!hasPermission(ctx.permissions, module, minLevel, scope)) {
		throw new PermissionDeniedError(module, minLevel, scope)
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
