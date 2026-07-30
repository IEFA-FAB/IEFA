import { describe, expect, test } from "bun:test"
import { resolveEffectivePermissions } from "./effective-permissions.ts"
import { hasPermission } from "./has-permission.ts"
import type { AppModule, PermissionScope, UserPermission } from "./types.ts"

function p(module: AppModule, level: number, scope?: { kitchen?: number; unit?: number; messHall?: number }): UserPermission {
	return {
		module,
		level,
		kitchen_id: scope?.kitchen ?? null,
		unit_id: scope?.unit ?? null,
		mess_hall_id: scope?.messHall ?? null,
	}
}

/**
 * Implementação ANTERIOR, reproduzida para o teste de equivalência: injeta `diner` implícito
 * quando não há regra explícita e descarta os denies.
 */
function legacyResolve(rows: UserPermission[]): UserPermission[] {
	const permissions = [...rows]
	if (!permissions.some((x) => x.module === "diner")) {
		permissions.push({ module: "diner", level: 1, mess_hall_id: null, kitchen_id: null, unit_id: null })
	}
	return permissions.filter((x) => x.level > 0)
}

describe("resolveEffectivePermissions — precedência de deny", () => {
	test("deny inline anula allow vindo de política", () => {
		const effective = resolveEffectivePermissions([p("kitchen", 0, { kitchen: 7 })], [p("kitchen", 2, { kitchen: 7 })])

		expect(hasPermission(effective, "kitchen", 1, { type: "kitchen", id: 7 })).toBe(false)
	})

	test("deny em política anula allow inline", () => {
		const effective = resolveEffectivePermissions([p("kitchen", 2, { kitchen: 7 })], [p("kitchen", 0, { kitchen: 7 })])

		expect(hasPermission(effective, "kitchen", 1, { type: "kitchen", id: 7 })).toBe(false)
	})

	test("deny sem escopo anula allow escopado do mesmo módulo", () => {
		const effective = resolveEffectivePermissions([p("kitchen", 0)], [p("kitchen", 2, { kitchen: 7 }), p("kitchen", 2, { kitchen: 9 })])

		expect(hasPermission(effective, "kitchen", 1, { type: "kitchen", id: 7 })).toBe(false)
		expect(hasPermission(effective, "kitchen", 1, { type: "kitchen", id: 9 })).toBe(false)
		expect(hasPermission(effective, "kitchen", 1)).toBe(false)
	})

	test("deny escopado não alcança outro escopo", () => {
		const effective = resolveEffectivePermissions([p("kitchen", 0, { kitchen: 7 }), p("kitchen", 2, { kitchen: 9 })])

		expect(hasPermission(effective, "kitchen", 1, { type: "kitchen", id: 7 })).toBe(false)
		expect(hasPermission(effective, "kitchen", 2, { type: "kitchen", id: 9 })).toBe(true)
	})

	test("deny escopado não alcança o allow sem escopo do mesmo módulo", () => {
		// Allow global vale para qualquer contexto; um deny de UMA cozinha não o derruba.
		const effective = resolveEffectivePermissions([p("kitchen", 2), p("kitchen", 0, { kitchen: 7 })])

		expect(hasPermission(effective, "kitchen", 2)).toBe(true)
	})

	test("deny de um módulo não afeta outro", () => {
		const effective = resolveEffectivePermissions([p("global", 0)], [p("kitchen", 2, { kitchen: 7 })])

		expect(hasPermission(effective, "global", 1)).toBe(false)
		expect(hasPermission(effective, "kitchen", 2, { type: "kitchen", id: 7 })).toBe(true)
	})

	test("nível efetivo é o maior allow entre origens", () => {
		const effective = resolveEffectivePermissions([p("kitchen", 1, { kitchen: 7 })], [p("kitchen", 2, { kitchen: 7 })])

		expect(hasPermission(effective, "kitchen", 2, { type: "kitchen", id: 7 })).toBe(true)
	})

	test("entradas de deny não vazam no resultado", () => {
		const effective = resolveEffectivePermissions([p("kitchen", 0, { kitchen: 7 }), p("unit", 2, { unit: 3 })])

		expect(effective.every((x) => x.level > 0)).toBe(true)
	})
})

describe("resolveEffectivePermissions — comensal implícito", () => {
	test("injeta diner quando não há regra alguma", () => {
		expect(hasPermission(resolveEffectivePermissions([]), "diner", 1)).toBe(true)
	})

	test("não injeta quando já existe allow explícito de diner", () => {
		const effective = resolveEffectivePermissions([p("diner", 2)])

		expect(effective.filter((x) => x.module === "diner")).toHaveLength(1)
		expect(hasPermission(effective, "diner", 2)).toBe(true)
	})

	test("deny explícito de diner remove o acesso implícito", () => {
		expect(hasPermission(resolveEffectivePermissions([p("diner", 0)]), "diner", 1)).toBe(false)
	})

	test("deny de diner vindo de política também remove", () => {
		expect(hasPermission(resolveEffectivePermissions([], [p("diner", 0)]), "diner", 1)).toBe(false)
	})
})

/**
 * `@iefa/pbac` é consumido por sisub, rumaer e sucont. Sem políticas anexadas — o estado de
 * todos eles até o console de políticas existir — a resolução nova tem de decidir como a
 * antiga, com UMA exceção deliberada (ver o describe seguinte): quando allow e deny
 * coexistem para o mesmo módulo, a antiga deixava o allow vencer.
 *
 * A comparação é SEMÂNTICA (via `hasPermission`), não de array: a nova colapsa duplicatas de
 * (módulo, escopo) para o maior nível, o que não muda nenhuma resposta de autorização.
 */
describe("equivalência com a implementação anterior (sem políticas)", () => {
	const MODULES: AppModule[] = ["diner", "kitchen", "unit", "messhall", "global", "analytics", "local-analytics", "storage"]
	const LEVELS = [0, 1, 2]
	const SCOPES: (PermissionScope | undefined)[] = [
		undefined,
		{ type: "kitchen", id: 7 },
		{ type: "kitchen", id: 9 },
		{ type: "unit", id: 3 },
		{ type: "mess_hall", id: 5 },
	]

	function scopeOf(s: PermissionScope | undefined) {
		if (!s) return undefined
		if (s.type === "kitchen") return { kitchen: s.id }
		if (s.type === "unit") return { unit: s.id }
		return { messHall: s.id }
	}

	/** Todas as combinações de UMA e de DUAS linhas sobre o conjunto acima. */
	function* rowSets(): Generator<UserPermission[]> {
		const singles: UserPermission[] = []
		for (const m of MODULES) {
			for (const l of LEVELS) {
				for (const s of SCOPES) singles.push(p(m, l, scopeOf(s)))
			}
		}
		for (const a of singles) {
			yield [a]
			// Pares com o mesmo módulo cobrem os casos interessantes (allow+deny, dois níveis).
			for (const b of singles) {
				if (b.module === a.module) yield [a, b]
			}
		}
	}

	/** Conjuntos onde allow e deny do mesmo módulo coexistem — divergência intencional. */
	function hasConflict(rows: UserPermission[]): boolean {
		return rows.some((a) => a.level === 0 && rows.some((b) => b.level > 0 && b.module === a.module))
	}

	test("decide igual para todo par (permissões, consulta), fora do conflito allow/deny", () => {
		let compared = 0
		for (const rows of rowSets()) {
			if (hasConflict(rows)) continue
			const legacy = legacyResolve(rows)
			const next = resolveEffectivePermissions(rows)

			for (const m of MODULES) {
				for (const minLevel of [1, 2]) {
					for (const s of SCOPES) {
						const before = hasPermission(legacy, m, minLevel, s)
						const after = hasPermission(next, m, minLevel, s)
						if (before !== after) {
							throw new Error(`divergência em ${JSON.stringify(rows)} → ${m}:${minLevel} escopo ${JSON.stringify(s)}: antes ${before}, agora ${after}`)
						}
						compared++
					}
				}
			}
		}
		// Guarda contra um gerador vazio passar como verde — o caso "suite vacuosa".
		expect(compared).toBeGreaterThan(50_000)
	})
})

/**
 * A única mudança de comportamento observável, e é a correção que motiva o refactor.
 *
 * Antes, `filter(level > 0)` descartava o deny — com allow e deny coexistindo para o mesmo
 * módulo, o allow sobrevivia. Isso passava despercebido porque, com uma origem só, a UI
 * editava a mesma linha e o par raramente aparecia; com políticas anexadas ele vira o caso
 * normal, e deixar o allow vencer significaria que anexar uma política revoga um deny
 * explícito do administrador.
 */
describe("divergência intencional: allow + deny no mesmo módulo", () => {
	test("antes o allow vencia; agora o deny vence", () => {
		const rows = [p("diner", 0), p("diner", 1)]

		expect(hasPermission(legacyResolve(rows), "diner", 1)).toBe(true)
		expect(hasPermission(resolveEffectivePermissions(rows), "diner", 1)).toBe(false)
	})

	test("vale para qualquer módulo, não só diner", () => {
		const rows = [p("global", 2), p("global", 0)]

		expect(hasPermission(legacyResolve(rows), "global", 2)).toBe(true)
		expect(hasPermission(resolveEffectivePermissions(rows), "global", 1)).toBe(false)
	})
})
