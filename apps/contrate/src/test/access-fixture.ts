import type { MeAccess, UnitSet } from "@iefa/alpha-client/access"

/** OMs do fixture: GAP-SJ (26) apoia IAE (100) e DCTA (101); GAP-RJ (10) não apoia ninguém. */
export const UNITS = [
	{ id: 10, code: "GAP-RJ", display_name: "Grupamento de Apoio do Rio de Janeiro" },
	{ id: 26, code: "GAP-SJ", display_name: "Grupamento de Apoio de São José dos Campos" },
	{ id: 100, code: "IAE", display_name: "Instituto de Aeronáutica e Espaço" },
	{ id: 101, code: "DCTA", display_name: "DCTA" },
]

/** Perfil do α com os papéis pedidos; o resto vazio. `units` segue o que o α devolveria. */
export function meAccess(roles: Partial<Record<keyof MeAccess["roles"], UnitSet>> = {}): MeAccess {
	const full = { requester: [], procurement: [], aci: [], admin: [], ...roles } as MeAccess["roles"]
	const sets = Object.values(full)
	const covered = new Set(sets.flatMap((set) => (set === "all" ? [] : set)))
	const units = sets.some((set) => set === "all") ? UNITS : UNITS.filter((unit) => covered.has(unit.id))
	return { roles: full, units, can_submit: true, level: 0, can_see_all: false, can_decide: false, can_manage_access: false }
}
