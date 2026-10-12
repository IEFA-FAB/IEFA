/**
 * Guards de autorização das operations do SISPROV.
 *
 * Com Drizzle a conexão usa o role do projeto e RLS não se aplica: o guard da operation é a
 * única barreira. Toda operation de escrita recebe `ctx` e chama um destes antes de tocar o
 * banco (regra opengrep `domain-op-discards-user-context`).
 *
 * O escopo é a OM (`unit`). Quando a operation conhece a OM alvo, passa `unitId`, e a
 * cobertura pela hierarquia de apoio (grant na apoiadora vale para as apoiadas) é resolvida
 * por `coversUnit` do pbac a partir do grafo de apoio que o chamador já carregou; sem grafo,
 * vale o escopo direto (`hasPermission`). Sem `unitId`, basta ter o módulo em QUALQUER escopo:
 * é o gate de "pode entrar no módulo", não o de "pode mexer nesta OM".
 */

import { hasAnyPermission, hasPermission, type UnitSupportEdge } from "@iefa/pbac"
import { SISPROV_ADMIN_MODULE, SISPROV_MODULES, SISPROV_PLANNING_MODULE, SISPROV_SUPPLY_MODULE, type SisprovModule } from "../modules.ts"
import type { AppModule, PermissionScope, UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"

export type UnitGuardOptions = {
	/** OM alvo da operação. Sem ela, o guard só exige o módulo em algum escopo. */
	unitId?: number
	/**
	 * Grafo de apoio (`core.units.id`, `supporting_unit_id`) já carregado pelo chamador. Com
	 * ele, grant na apoiadora cobre a OM alvo; sem ele, só o escopo direto ou o global valem.
	 */
	supportGraph?: readonly UnitSupportEdge[]
}

export function requirePermission(ctx: UserContext, module: AppModule, minLevel: 1 | 2 | 3, scope?: PermissionScope): void {
	if (!hasPermission(ctx.permissions, module, minLevel, scope)) {
		throw new PermissionDeniedError(module, minLevel, scope)
	}
}

/** Passa se o usuário tiver QUALQUER um dos módulos no nível mínimo. */
export function requireAnyPermission(ctx: UserContext, modules: readonly AppModule[], minLevel: 1 | 2 | 3, scope?: PermissionScope): void {
	if (!hasAnyPermission(ctx.permissions, modules, minLevel, scope)) {
		throw new PermissionDeniedError(modules.join(" | "), minLevel, scope)
	}
}

/**
 * Exige a permissão SEM escopo, a que vale para toda a rede. `requirePermission` sem escopo
 * aceitaria qualquer grant escopado do módulo; para dado que agrega TODAS as OMs (curva global,
 * grupos sistêmicos), isso entregaria a FAB inteira a quem tem uma OM só.
 */
export function requireUnscopedPermission(ctx: UserContext, module: AppModule, minLevel: 1 | 2 | 3): void {
	const unscoped = ctx.permissions.some(
		(p) => p.module === module && p.level >= minLevel && p.unit_id === null && p.kitchen_id === null && p.mess_hall_id === null
	)
	if (!unscoped || !hasPermission(ctx.permissions, module, minLevel)) throw new PermissionDeniedError(module, minLevel)
}

/** OMs que, pela hierarquia de apoio, cobrem a OM alvo: ela mesma e as apoiadoras acima dela. */
function coveringUnits(unitId: number, graph: readonly UnitSupportEdge[] | undefined): number[] {
	const covering = [unitId]
	if (!graph) return covering
	const supporterOf = new Map(graph.map((edge) => [edge.id, edge.supporting_unit_id]))
	const seen = new Set<number>([unitId])
	let current: number | null | undefined = supporterOf.get(unitId)
	while (typeof current === "number" && !seen.has(current)) {
		seen.add(current)
		covering.push(current)
		current = supporterOf.get(current)
	}
	return covering
}

function requireSisprovModule(ctx: UserContext, module: SisprovModule, minLevel: 1 | 2 | 3, options: UnitGuardOptions = {}): void {
	if (options.unitId === undefined) {
		requirePermission(ctx, module, minLevel)
		return
	}
	const scope: PermissionScope = { type: "unit", id: options.unitId }
	// Global, escopo direto, ou escopo numa apoiadora que cubra a OM alvo. O deny é respeitado
	// em cada checagem por `hasPermission`.
	const granted = coveringUnits(options.unitId, options.supportGraph).some((id) => hasPermission(ctx.permissions, module, minLevel, { type: "unit", id }))
	if (!granted) throw new PermissionDeniedError(module, minLevel, scope)
}

/** Elo SISPROV na OM: 1 consulta a previsão, 2 informa e ajusta. */
export function requirePlanning(ctx: UserContext, minLevel: 1 | 2, options?: UnitGuardOptions): void {
	requireSisprovModule(ctx, SISPROV_PLANNING_MODULE, minLevel, options)
}

/** Almoxarifado da OM: 1 consulta OF e estoque, 2 recebe, distribui, troca, devolve. */
export function requireSupply(ctx: UserContext, minLevel: 1 | 2, options?: UnitGuardOptions): void {
	requireSisprovModule(ctx, SISPROV_SUPPLY_MODULE, minLevel, options)
}

/** SDAB: 2 gestão sistêmica, 3 gerenciar grants. Sem `unitId`, exige o grant GLOBAL. */
export function requireSisprovAdmin(ctx: UserContext, minLevel: 2 | 3, options?: UnitGuardOptions): void {
	if (options?.unitId === undefined) {
		requireUnscopedPermission(ctx, SISPROV_ADMIN_MODULE, minLevel)
		return
	}
	requireSisprovModule(ctx, SISPROV_ADMIN_MODULE, minLevel, options)
}

/** Qualquer módulo do SISPROV, nível 1: o gate de "pode usar o app" (perfil, hub). */
export function requireSisprovApp(ctx: UserContext): void {
	requireAnyPermission(ctx, SISPROV_MODULES, 1)
}
