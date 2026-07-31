import type { AppModule, PermissionScope, UserPermission } from "./types.ts"

/** `true` quando a permissão não tem escopo — vale para qualquer contexto. */
function isUnscoped(p: UserPermission): boolean {
	return p.unit_id === null && p.mess_hall_id === null && p.kitchen_id === null
}

/** `true` quando a permissão casa o escopo consultado. */
function matchesScope(p: UserPermission, scope: PermissionScope): boolean {
	if (scope.type === "unit") return p.unit_id === scope.id
	if (scope.type === "mess_hall") return p.mess_hall_id === scope.id
	return p.kitchen_id === scope.id
}

/**
 * Verifica se um conjunto de permissões concede acesso a um módulo.
 *
 * ## Denies fazem parte da entrada
 *
 * O conjunto efetivo (`resolveEffectivePermissions`) carrega as entradas de deny (`level 0`)
 * junto com os allows, e este guard as aplica ANTES de procurar um allow.
 *
 * Isso existe porque um allow SEM escopo não é representável como "vale em todo lugar menos
 * na cozinha 7": a lista é plana, e um deny escopado não tem como recortar o allow global.
 * Enquanto o resolver apenas removia os allows cobertos, esse caso escapava — o allow sem
 * escopo sobrevivia e, valendo para qualquer contexto, reautorizava justamente o escopo que o
 * administrador tinha negado.
 *
 * Um deny sem escopo bloqueia o módulo inteiro; um deny escopado bloqueia só aquele escopo —
 * inclusive contra um allow sem escopo.
 *
 * @param permissions - Permissões efetivas do usuário (allows + denies)
 * @param module      - Módulo a verificar
 * @param minLevel    - Nível mínimo exigido (default: 1)
 * @param scope       - Escopo opcional; sem escopo aceita qualquer permissão do módulo
 */
export function hasPermission(permissions: UserPermission[], module: AppModule, minLevel = 1, scope?: PermissionScope): boolean {
	const ofModule = permissions.filter((p) => p.module === module)

	for (const deny of ofModule) {
		if (deny.level > 0) continue
		// Deny sem escopo derruba o módulo inteiro, qualquer que seja a consulta.
		if (isUnscoped(deny)) return false
		// Deny escopado derruba a consulta daquele escopo — mesmo que o allow seja global.
		if (scope && matchesScope(deny, scope)) return false
	}

	return ofModule.some((p) => {
		if (p.level < minLevel) return false
		// Permissão sem escopo vale para qualquer contexto.
		if (isUnscoped(p)) return true
		// Consulta sem escopo aceita qualquer escopo concedido.
		if (!scope) return true
		return matchesScope(p, scope)
	})
}
