import { hasPermission } from "./has-permission.ts"
import type { AppModule, PermissionScope, UserPermission } from "./types.ts"

/** Eixo de escopo de um módulo. */
export type ScopeAxis = PermissionScope["type"]

const AXIS_FIELD = {
	kitchen: "kitchen_id",
	unit: "unit_id",
	mess_hall: "mess_hall_id",
} as const satisfies Record<ScopeAxis, keyof UserPermission>

export type ModuleScopes = {
	/** `true` quando existe allow SEM escopo — o módulo vale em qualquer contexto. */
	isGlobal: boolean
	/** Ids explicitamente concedidos naquele eixo, já descontados os denies. */
	ids: Set<number>
}

/**
 * Resolve, para um módulo, quais escopos o usuário efetivamente alcança.
 *
 * Existe para matar a duplicação que rodava em seis telas de seleção (cozinha, unidade,
 * refeitório, produção, análises, estoque), todas repetindo o mesmo par
 * `permissions.some(...)` / `permissions.filter(...).map(...)`.
 *
 * Repetir isso é perigoso agora que o conjunto efetivo carrega as entradas de deny: um
 * `some()` cru contaria uma linha `level 0` como concessão. Aqui a decisão passa por
 * `hasPermission`, que aplica a precedência de deny — inclusive o caso de um deny escopado
 * recortar um allow sem escopo.
 */
export function resolveModuleScopes(permissions: UserPermission[], module: AppModule, axis: ScopeAxis): ModuleScopes {
	const field = AXIS_FIELD[axis]
	const allows = permissions.filter((p) => p.module === module && p.level > 0)

	// Allow sem escopo só vale se nenhum deny sem escopo o derrubar.
	const hasUnscopedAllow = allows.some((p) => p.unit_id === null && p.kitchen_id === null && p.mess_hall_id === null)
	const isGlobal = hasUnscopedAllow && hasPermission(permissions, module, 1)

	const ids = new Set<number>()
	for (const permission of allows) {
		const id = permission[field]
		if (typeof id !== "number") continue
		// Cada id passa pelo guard: um deny naquele escopo o remove da lista.
		if (hasPermission(permissions, module, 1, { type: axis, id })) ids.add(id)
	}

	return { isGlobal, ids }
}
