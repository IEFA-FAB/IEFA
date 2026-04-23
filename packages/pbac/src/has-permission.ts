import type { AppModule, PermissionScope, UserPermission } from "./types.ts"

/**
 * Verifica se um conjunto de permissões concede acesso a um módulo.
 *
 * @param permissions - Permissões efetivas do usuário (sem entradas de deny)
 * @param module      - Módulo a verificar
 * @param minLevel    - Nível mínimo exigido (default: 1)
 * @param scope       - Escopo opcional; sem escopo aceita qualquer permissão do módulo
 */
export function hasPermission(permissions: UserPermission[], module: AppModule, minLevel = 1, scope?: PermissionScope): boolean {
	return permissions.some((p) => {
		if (p.module !== module || p.level < minLevel) return false

		// Permissão global (sem escopo) vale para qualquer contexto
		const isGlobal = p.unit_id === null && p.mess_hall_id === null && p.kitchen_id === null
		if (isGlobal) return true

		if (!scope) return true // sem restrição de escopo → aceita qualquer escopo

		if (scope.type === "unit" && p.unit_id === scope.id) return true
		if (scope.type === "mess_hall" && p.mess_hall_id === scope.id) return true
		if (scope.type === "kitchen" && p.kitchen_id === scope.id) return true

		return false
	})
}
