/**
 * Cobertura por unidade (OM) através da HIERARQUIA DE APOIO — e a política de quem pode
 * conceder acesso em qual OM.
 *
 * ## Apoio, não comando
 *
 * `core.units.parent_unit_id` é a cadeia de COMANDO (ELO → COMAR → FAB) e serve ao rollup
 * regional do sisub. A relação que decide alcance de acesso é outra: a de APOIO
 * (`core.units.supporting_unit_id`). O GAP-SJ apoia o IAE, o DCTA e o IEFA — conduz as
 * licitações deles —, então quem trabalha no GAP-SJ precisa enxergar o fluxo dessas OMs.
 * O inverso NÃO vale: o IAE não enxerga o que é do GAP-SJ nem das outras apoiadas.
 *
 * ## Transitiva
 *
 * A cobertura desce a relação inteira: se A apoia B e B apoia C, um grant em A cobre C. Hoje
 * a árvore tem um nível só, mas a regra é a mesma em qualquer profundidade, e o custo é o
 * de percorrer ~35 linhas em memória. O conjunto visitado corta ciclo (que o banco não
 * impede além do auto-apoio).
 *
 * Tudo aqui é PURO e agnóstico de app: o α é o primeiro consumidor, e a estrutura existe para
 * ser levada ao sisub e ao sucont sem reescrever a regra.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveModuleScopes } from "./module-scopes.ts"
import type { AppModule, UserPermission } from "./types.ts"

// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema de SupabaseClient
type AnySupabaseClient = SupabaseClient<any, any>

/**
 * Unidades alcançadas por um papel: `"all"` (grant global, sem deny escopado que o recorte)
 * ou a lista explícita de ids, JÁ expandida pela hierarquia de apoio.
 */
export type UnitCoverage = "all" | readonly number[]

/** Uma aresta da hierarquia de apoio: a unidade e a sua apoiadora (se houver). */
export type UnitSupportEdge = { id: number; supporting_unit_id: number | null }

/**
 * Expande um conjunto de unidades para tudo o que elas cobrem: cada unidade MAIS as que ela
 * apoia, transitivamente. Unidade que não está no grafo continua na saída (ela mesma é
 * coberta), só não expande.
 */
export function expandSupportCoverage(unitIds: Iterable<number>, graph: readonly UnitSupportEdge[]): number[] {
	const supported = new Map<number, number[]>()
	for (const edge of graph) {
		if (edge.supporting_unit_id === null || edge.supporting_unit_id === edge.id) continue
		const list = supported.get(edge.supporting_unit_id) ?? []
		list.push(edge.id)
		supported.set(edge.supporting_unit_id, list)
	}

	const covered = new Set<number>()
	const pending = [...unitIds]
	while (pending.length > 0) {
		const id = pending.pop() as number
		if (covered.has(id)) continue
		covered.add(id)
		for (const child of supported.get(id) ?? []) pending.push(child)
	}
	return [...covered].sort((a, b) => a - b)
}

/**
 * A cobertura alcança esta unidade?
 *
 * Unidade `null` é "sem OM" — o grant global, ou o registro legado sem unidade — e só
 * `"all"` a cobre: um papel escopado nunca alcança o que não é de OM nenhuma.
 */
export function coversUnit(coverage: UnitCoverage, unitId: number | null): boolean {
	if (coverage === "all") return true
	if (unitId === null) return false
	return coverage.includes(unitId)
}

/** `true` quando a cobertura não alcança nada. */
export function isEmptyCoverage(coverage: UnitCoverage): boolean {
	return coverage !== "all" && coverage.length === 0
}

/** União de coberturas: `"all"` absorve tudo. */
export function unionCoverage(...coverages: readonly UnitCoverage[]): UnitCoverage {
	if (coverages.some((c) => c === "all")) return "all"
	const ids = new Set<number>()
	for (const c of coverages) for (const id of c as readonly number[]) ids.add(id)
	return [...ids].sort((a, b) => a - b)
}

/**
 * `true` quando alguma permissão destes módulos tem escopo de unidade — allow OU deny. Só
 * então a resolução precisa do grafo de apoio; quem tem só grant global (ou nenhum) não
 * paga a leitura.
 */
export function needsSupportGraph(permissions: readonly UserPermission[], modules: readonly AppModule[]): boolean {
	return permissions.some((p) => modules.includes(p.module) && p.unit_id !== null)
}

/**
 * Cobertura efetiva de UM módulo, por unidade, expandida pela hierarquia de apoio.
 *
 *   - allow global sem deny escopado → `"all"`;
 *   - allow global COM deny escopado → todas as unidades do grafo, menos as negadas (a lista
 *     plana não representa "tudo menos a 7", então aqui ela vira lista explícita);
 *   - allows escopados → cada OM mais as que ela apoia, menos as negadas;
 *   - deny sem escopo → nada (é o `hasPermission` que o aplica, via `resolveModuleScopes`).
 *
 * O deny escopado EXPANDE como o allow: negar o GAP-SJ nega também o que ele apoia. É o lado
 * seguro — quem nega a apoiadora está negando o fluxo dela, e deixar as apoiadas de pé
 * reabriria justamente esse fluxo. Deny vence allow, venha de onde vier: allow no IAE com
 * deny no GAP-SJ deixa o IAE de fora.
 *
 * `graph` só pode ser `null` quando {@link needsSupportGraph} é `false` — o contrário é erro
 * de programação, e lança em vez de calcular uma cobertura errada.
 */
export function resolveModuleUnitCoverage(
	permissions: UserPermission[],
	module: AppModule,
	graph: readonly UnitSupportEdge[] | null,
	minLevel = 1
): UnitCoverage {
	const { isGlobal, ids } = resolveModuleScopes(permissions, module, "unit", minLevel)
	const deniedRoots = permissions.filter((p) => p.module === module && p.level <= 0 && p.unit_id !== null).map((p) => p.unit_id as number)

	if (isGlobal && deniedRoots.length === 0) return "all"
	if (!isGlobal && ids.size === 0) return []
	if (graph === null) throw new Error(`resolveModuleUnitCoverage(${module}): permissão escopada sem o grafo de apoio`)

	const denied = new Set(expandSupportCoverage(deniedRoots, graph))
	const reached = isGlobal ? graph.map((edge) => edge.id) : expandSupportCoverage(ids, graph)
	return [...new Set(reached)].filter((id) => !denied.has(id)).sort((a, b) => a - b)
}

/**
 * Lê o grafo de apoio de `core.units`. Recebe um cliente do schema `core` com leitura.
 *
 * O teto do PostgREST (1000 linhas) cortaria o grafo SEM erro — e uma apoiada fora da lista
 * sairia da cobertura em silêncio. Hoje são ~35 linhas; se um dia encostar no teto, a
 * leitura falha em vez de encolher a autorização.
 */
export async function fetchUnitSupportGraph(coreClient: AnySupabaseClient): Promise<UnitSupportEdge[]> {
	const MAX_ROWS = 1000
	const { data, error } = await coreClient.from("units").select("id, supporting_unit_id").order("id").limit(MAX_ROWS)
	if (error) throw new Error(`Falha ao ler a hierarquia de apoio das unidades: ${error.message}`)
	const rows = (data ?? []) as UnitSupportEdge[]
	if (rows.length >= MAX_ROWS) throw new Error("Hierarquia de apoio truncada no teto de linhas do PostgREST — a cobertura seria calculada a menos")
	return rows
}

/** Por que a concessão foi recusada. */
export type GrantRefusal =
	/** Ninguém altera o próprio acesso. */
	| "SELF"
	/** Grant global (`unit_id` nulo) só por administrador global. */
	| "GLOBAL_REQUIRES_GLOBAL_ADMIN"
	/** A OM do grant está fora do que o administrador cobre. */
	| "OUTSIDE_COVERAGE"

const REFUSAL_MESSAGE: Record<GrantRefusal, string> = {
	SELF: "Você não pode alterar o próprio acesso. Peça a outro administrador.",
	GLOBAL_REQUIRES_GLOBAL_ADMIN: "Só um administrador global concede ou revoga acesso sem OM (global).",
	OUTSIDE_COVERAGE: "Esta OM está fora da sua administração — você só concede acesso na sua OM e nas que ela apoia.",
}

/**
 * Concessão/revogação recusada pela política de administração escopada. Como
 * `PermissionDeniedError`, não pertence a hierarquia de app nenhum: cada consumidor mapeia
 * para o próprio transporte (403). `message` já é a frase para o usuário.
 */
export class GrantNotAllowedError extends Error {
	readonly code = "GRANT_NOT_ALLOWED" as const

	constructor(public readonly reason: GrantRefusal) {
		super(REFUSAL_MESSAGE[reason])
		this.name = "GrantNotAllowedError"
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

/**
 * Ninguém altera o próprio acesso. Rebaixar-se ou revogar-se tranca o administrador para
 * fora da tela — e, se ele for o último, tranca todo mundo, com conserto só por SQL.
 * Contar administradores teria corrida entre a contagem e o delete; a regra é outra
 * pessoa mexer.
 */
export function assertNotSelf(actorId: string, targetUserId: string): void {
	if (actorId === targetUserId) throw new GrantNotAllowedError("SELF")
}

/**
 * Política de administração ESCOPADA: o administrador pode conceder ou revogar este grant?
 *
 *   - nunca sobre si mesmo;
 *   - administrador global (`"all"`) concede qualquer coisa, inclusive grant global;
 *   - administrador de OM concede SÓ na própria OM e nas que ela apoia (a cobertura, já
 *     expandida) — nunca grant global, nunca fora dela, nunca na apoiadora da própria OM.
 *
 * Vale para qualquer papel do app, inclusive o de administrador: o administrador do GAP-SJ
 * pode fazer um administrador do IAE, e o do IAE não pode fazer um do GAP-SJ.
 *
 * `coverage` é a cobertura do módulo de ADMINISTRAÇÃO do ator, resolvida pelo app com a
 * mesma expansão de apoio que decide o resto do acesso.
 */
export function assertGrantable(admin: { actorId: string; coverage: UnitCoverage }, target: { userId: string; unitId: number | null }): void {
	assertNotSelf(admin.actorId, target.userId)
	if (admin.coverage === "all") return
	if (target.unitId === null) throw new GrantNotAllowedError("GLOBAL_REQUIRES_GLOBAL_ADMIN")
	if (!coversUnit(admin.coverage, target.unitId)) throw new GrantNotAllowedError("OUTSIDE_COVERAGE")
}
