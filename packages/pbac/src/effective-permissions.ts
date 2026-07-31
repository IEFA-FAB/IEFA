import type { AppModule, UserPermission } from "./types.ts"

/**
 * Resolução pura das permissões efetivas de um usuário, a partir de TODAS as origens.
 *
 * Origens possíveis (a segunda chega com as políticas nomeadas):
 *   - grants inline    — linhas de `access_control.user_permissions` (a "inline policy")
 *   - políticas anexadas — statements das políticas ligadas ao usuário
 *
 * ## Por que o deny precisa ser precedência, e não ausência
 *
 * O comportamento anterior era `permissions.filter((p) => p.level > 0)`: o deny era
 * simplesmente descartado. Com UMA origem isso equivale a negar — a UI edita a mesma linha,
 * então não havia como um allow coexistir com um deny para o mesmo módulo/escopo.
 *
 * Com DUAS origens deixa de equivaler: um deny inline e um allow vindo de política passam a
 * coexistir, e o filtro deixaria o allow sobreviver — exatamente o oposto do pretendido.
 * Daí a resolução em duas fases: coleta os denies de qualquer origem, depois emite só os
 * allows que nenhum deny cobre. É também o comportamento do IAM, o que mantém o modelo
 * mental consistente com a analogia que o console usa.
 *
 * ## Retrocompatibilidade
 *
 * Sem políticas anexadas, o resultado é idêntico ao do filtro antigo — cada deny cobre o
 * próprio allow que a linha carregaria e não há segunda origem para sobreviver. Isso vale
 * como contrato, não como argumento: `effective-permissions.test.ts` compara as duas
 * implementações sobre um conjunto exaustivo de combinações. Importa porque `@iefa/pbac` é
 * consumido também por rumaer e sucont.
 */

/** Chave de escopo de uma permissão. `null` = sem escopo (vale para qualquer contexto). */
type ScopeKey = string | null

function scopeKeyOf(p: UserPermission): ScopeKey {
	if (p.unit_id !== null) return `unit:${p.unit_id}`
	if (p.kitchen_id !== null) return `kitchen:${p.kitchen_id}`
	if (p.mess_hall_id !== null) return `mess_hall:${p.mess_hall_id}`
	return null
}

/**
 * Um deny cobre um allow quando é do mesmo módulo E o escopo do deny abrange o do allow.
 * Deny sem escopo abrange todos os escopos daquele módulo; deny escopado abrange apenas o
 * escopo idêntico.
 */
function isCoveredByDeny(permission: UserPermission, denies: Map<AppModule, Set<ScopeKey>>): boolean {
	const moduleDenies = denies.get(permission.module)
	if (!moduleDenies) return false
	if (moduleDenies.has(null)) return true
	return moduleDenies.has(scopeKeyOf(permission))
}

/** `true` se existe deny para o módulo em qualquer escopo. */
function hasAnyDenyForModule(module: AppModule, denies: Map<AppModule, Set<ScopeKey>>): boolean {
	return (denies.get(module)?.size ?? 0) > 0
}

/**
 * Une as permissões de todas as origens aplicando precedência de deny e colapsando
 * duplicatas para o maior nível.
 *
 * @param sources - listas de permissões cruas (grants inline, statements de política…).
 *   A ordem entre elas é irrelevante: o deny vence venha de onde vier.
 * @returns permissões efetivas: os allows sobreviventes MAIS as entradas de deny, que
 *   `hasPermission` precisa para negar um escopo coberto por um allow sem escopo. Quem
 *   percorre a lista em vez de consultar `hasPermission` deve filtrar `level > 0`.
 */
export function resolveEffectivePermissions(...sources: readonly UserPermission[][]): UserPermission[] {
	const all = sources.flat()

	// Fase 1 — coleta os denies (level 0) de todas as origens.
	const denies = new Map<AppModule, Set<ScopeKey>>()
	for (const p of all) {
		if (p.level > 0) continue
		const scopes = denies.get(p.module) ?? new Set<ScopeKey>()
		scopes.add(scopeKeyOf(p))
		denies.set(p.module, scopes)
	}

	// Fase 2 — emite os allows que nenhum deny cobre, mantendo o maior nível por
	// (módulo, escopo). Duas origens podem conceder o mesmo par em níveis diferentes.
	//
	// A varredura NÃO resolve tudo: um allow sem escopo não é recortável por um deny
	// escopado numa lista plana ("vale em todo lugar menos na cozinha 7" não tem
	// representação). Por isso os denies seguem no resultado e `hasPermission` os aplica
	// antes de procurar allow — ver a fase 3.
	const winners = new Map<string, UserPermission>()
	for (const p of all) {
		if (p.level <= 0) continue
		if (isCoveredByDeny(p, denies)) continue
		const key = `${p.module}|${scopeKeyOf(p) ?? "*"}`
		const current = winners.get(key)
		if (!current || p.level > current.level) winners.set(key, p)
	}

	const effective = Array.from(winners.values())

	// Fase 3 — os denies permanecem no conjunto efetivo. `hasPermission` os consulta antes de
	// qualquer allow, o que cobre o caso que a fase 2 não consegue: allow sem escopo + deny
	// escopado. Denies têm `level 0`, então nunca satisfazem `level >= minLevel` e não podem
	// ser confundidos com concessão — mas quem ITERA o array precisa filtrar `level > 0`.
	const denyEntries = all.filter((p) => p.level <= 0)

	// Implicit Allow: todo usuário válido é comensal, a menos que exista regra explícita de
	// `diner` — inclusive um deny, que remove o acesso implícito.
	const hasExplicitDiner = effective.some((p) => p.module === "diner") || hasAnyDenyForModule("diner", denies)
	if (!hasExplicitDiner) {
		effective.push({ module: "diner", level: 1, mess_hall_id: null, kitchen_id: null, unit_id: null })
	}

	return [...effective, ...denyEntries]
}
