import { describe, expect, test } from "bun:test"
import type { UnitSupportEdge, UserPermission } from "@iefa/pbac"
import {
	type AlphaAccess,
	coversUnit,
	decideSubmissionRead,
	decideSubmissionReview,
	decideThreadAccess,
	hasRole,
	legacyAccessFields,
	needsUnitGraph,
	resolveAlphaAccess,
	unitsFor,
} from "./alpha-access.ts"

// GAP-SJ (26) apoia IAE (100), DCTA (101) e IEFA (102). GAP-RJ (10) é outra compradora.
const GAP_RJ = 10
const GAP_SJ = 26
const IAE = 100
const DCTA = 101
const IEFA = 102

const GRAPH: UnitSupportEdge[] = [
	{ id: GAP_RJ, supporting_unit_id: null },
	{ id: GAP_SJ, supporting_unit_id: null },
	{ id: IAE, supporting_unit_id: GAP_SJ },
	{ id: DCTA, supporting_unit_id: GAP_SJ },
	{ id: IEFA, supporting_unit_id: GAP_SJ },
]

function grant(module: UserPermission["module"], level: number, unit_id: number | null = null): UserPermission {
	return { module, level, mess_hall_id: null, kitchen_id: null, unit_id }
}

function access(permissions: UserPermission[]): AlphaAccess {
	return resolveAlphaAccess(permissions, needsUnitGraph(permissions) ? GRAPH : null)
}

const ME = "me"
const COLLEAGUE = "colleague"

describe("resolveAlphaAccess", () => {
	test("sem grant: nenhum papel, mas o envio segue aberto", () => {
		expect(access([])).toEqual({ roles: { requester: [], procurement: [], aci: [], admin: [] }, canSubmit: true })
	})

	test("grant global vira 'all' e dispensa o grafo", () => {
		const permissions = [grant("alpha-aci", 1), grant("alpha-admin", 3)]
		expect(needsUnitGraph(permissions)).toBe(false)
		expect(access(permissions).roles).toEqual({ requester: [], procurement: [], aci: "all", admin: "all" })
	})

	// O módulo saiu do `AppModule` e a limpeza (20260921090000) converte e apaga as linhas; a que
	// ela não consegue apagar (papel já existente com nível abaixo do exigido) segue sem efeito nenhum.
	test("uma linha do módulo `alpha` antigo que tenha sobrado não é lida — nem o allow, nem o deny", () => {
		const legacyModule = "alpha" as UserPermission["module"]
		const legacy = access([grant(legacyModule, 3), grant(legacyModule, 0)])
		expect(legacy.roles).toEqual({ requester: [], procurement: [], aci: [], admin: [] })
		expect(legacy.canSubmit).toBe(true)
	})

	test("grant de outro app não vaza para o α", () => {
		expect(access([grant("sucont-admin", 3), grant("admin", 3), grant("unit", 2, GAP_SJ)]).roles.aci).toEqual([])
	})

	test("alpha-admin só conta no nível 3", () => {
		expect(access([grant("alpha-admin", 2)]).roles.admin).toEqual([])
		expect(access([grant("alpha-admin", 3, IAE)]).roles.admin).toEqual([IAE])
	})

	test("escopado na apoiadora cobre as apoiadas", () => {
		expect(access([grant("alpha-procurement", 1, GAP_SJ)]).roles.procurement).toEqual([GAP_SJ, IAE, DCTA, IEFA])
	})

	test("escopado na apoiada NÃO cobre a apoiadora nem as irmãs", () => {
		const coverage = access([grant("alpha-aci", 1, IAE)]).roles.aci
		expect(coverage).toEqual([IAE])
		expect(coversUnit(coverage, GAP_SJ)).toBe(false)
		expect(coversUnit(coverage, DCTA)).toBe(false)
	})

	test("deny escopado recorta uma OM de um allow GLOBAL", () => {
		const coverage = access([grant("alpha-aci", 1), grant("alpha-aci", 0, GAP_SJ)]).roles.aci
		expect(coverage).not.toBe("all")
		// A apoiadora negada leva as apoiadas junto; o resto da FAB segue coberto.
		expect(coverage).toEqual([GAP_RJ])
	})

	test("deny sem escopo em alpha-requester fecha o envio (e só ele)", () => {
		const denied = access([grant("alpha-requester", 0), grant("alpha-aci", 1, GAP_SJ)])
		expect(denied.canSubmit).toBe(false)
		expect(denied.roles.requester).toEqual([])
		expect(denied.roles.aci).toEqual([GAP_SJ, IAE, DCTA, IEFA])
	})

	test("deny ESCOPADO em alpha-requester não fecha o envio", () => {
		expect(access([grant("alpha-requester", 0, GAP_SJ)]).canSubmit).toBe(true)
	})
})

describe("unitsFor / hasRole", () => {
	test("união dos papéis; 'all' absorve", () => {
		const a = access([grant("alpha-requester", 1, IAE), grant("alpha-procurement", 1, GAP_RJ)])
		expect(unitsFor(a, "requester", "procurement")).toEqual([GAP_RJ, IAE])
		expect(unitsFor(access([grant("alpha-aci", 1), grant("alpha-requester", 1, IAE)]), "requester", "aci")).toBe("all")
	})

	test("hasRole global só com 'all'", () => {
		const scoped = access([grant("alpha-aci", 1, GAP_SJ)])
		expect(hasRole(scoped, "aci")).toBe(true)
		expect(hasRole(scoped, "aci", { global: true })).toBe(false)
		expect(hasRole(access([grant("alpha-aci", 1)]), "aci", { global: true })).toBe(true)
	})
})

describe("decideSubmissionRead", () => {
	test("o autor sempre lê o que enviou — mesmo sem papel e em OM que não cobre", () => {
		expect(decideSubmissionRead(access([]), ME, { user_id: ME, unit_id: GAP_RJ })).toBe(true)
	})

	test("sem papel, a submissão do colega não", () => {
		expect(decideSubmissionRead(access([]), ME, { user_id: COLLEAGUE, unit_id: IAE })).toBe(false)
	})

	test("requisitante da OM lê TODAS as submissões dela (continuidade nas férias do colega)", () => {
		expect(decideSubmissionRead(access([grant("alpha-requester", 1, IAE)]), ME, { user_id: COLLEAGUE, unit_id: IAE })).toBe(true)
	})

	test("licitações da apoiadora lê a da apoiada; o da apoiada não lê a da apoiadora", () => {
		expect(decideSubmissionRead(access([grant("alpha-procurement", 1, GAP_SJ)]), ME, { user_id: COLLEAGUE, unit_id: IEFA })).toBe(true)
		expect(decideSubmissionRead(access([grant("alpha-procurement", 1, IEFA)]), ME, { user_id: COLLEAGUE, unit_id: GAP_SJ })).toBe(false)
	})

	test("papel de outra OM não lê", () => {
		expect(decideSubmissionRead(access([grant("alpha-aci", 1, GAP_RJ)]), ME, { user_id: COLLEAGUE, unit_id: IAE })).toBe(false)
	})

	test("alpha-admin não lê processo — administrar acesso não é papel de fluxo", () => {
		expect(decideSubmissionRead(access([grant("alpha-admin", 3)]), ME, { user_id: COLLEAGUE, unit_id: IAE })).toBe(false)
	})
})

describe("decideSubmissionReview", () => {
	test("só o ACI que cobre a OM do processo decide", () => {
		expect(decideSubmissionReview(access([grant("alpha-aci", 1, GAP_SJ)]), { user_id: COLLEAGUE, unit_id: DCTA })).toBe(true)
		expect(decideSubmissionReview(access([grant("alpha-aci", 1, GAP_RJ)]), { user_id: COLLEAGUE, unit_id: DCTA })).toBe(false)
	})

	test("ser o autor, licitações ou requisitante da OM não basta", () => {
		const notAci = access([grant("alpha-procurement", 1), grant("alpha-requester", 1)])
		expect(decideSubmissionReview(notAci, { user_id: ME, unit_id: IAE })).toBe(false)
	})
})

// @deprecated — sai com os campos legados do `/me/access`, no PR seguinte (ver `legacyAccessFields`).
describe("legacyAccessFields", () => {
	test("deriva o formato por nível a partir dos papéis", () => {
		expect(legacyAccessFields(access([]))).toEqual({ level: 0, can_see_all: false, can_decide: false, can_manage_access: false })
		expect(legacyAccessFields(access([grant("alpha-requester", 1, IAE)]))).toEqual({
			level: 1,
			can_see_all: false,
			can_decide: false,
			can_manage_access: false,
		})
		expect(legacyAccessFields(access([grant("alpha-procurement", 1, GAP_SJ)]))).toMatchObject({ level: 2, can_see_all: true, can_decide: false })
	})

	test("os quatro papéis (na mesma OM ou globais) dão o ACI administrador de antes", () => {
		const expected = { level: 3, can_see_all: true, can_decide: true, can_manage_access: true } as const
		expect(legacyAccessFields(access([grant("alpha-requester", 1), grant("alpha-procurement", 1), grant("alpha-aci", 1), grant("alpha-admin", 3)]))).toEqual(
			expected
		)
		expect(
			legacyAccessFields(
				access([grant("alpha-requester", 1, IAE), grant("alpha-procurement", 1, IAE), grant("alpha-aci", 1, IAE), grant("alpha-admin", 3, IAE)])
			)
		).toEqual(expected)
	})
})

/**
 * Acúmulo de papéis, SEM segregação de funções — decisão do mantenedor (2026-09-19): a mesma
 * pessoa pode ser requisitante, licitações, ACI e administradora na MESMA OM, e o ACI que
 * enviou o documento tria e emite parecer sobre ele. Se um destes testes falhar, é mudança
 * de regra — não conserto.
 */
describe("acúmulo de papéis (sem segregação de funções)", () => {
	const allFourAtIae = [grant("alpha-requester", 1, IAE), grant("alpha-procurement", 1, IAE), grant("alpha-aci", 1, IAE), grant("alpha-admin", 3, IAE)]

	test("os quatro papéis na mesma OM resolvem juntos, sem um apagar o outro", () => {
		const a = access(allFourAtIae)
		expect(a.roles).toEqual({ requester: [IAE], procurement: [IAE], aci: [IAE], admin: [IAE] })
		expect(a.canSubmit).toBe(true)
		for (const role of ["requester", "procurement", "aci", "admin"] as const) expect(hasRole(a, role)).toBe(true)
	})

	test("a cobertura de leitura e a da fila são a união dos papéis", () => {
		const a = access(allFourAtIae)
		expect(unitsFor(a, "requester", "procurement", "aci")).toEqual([IAE])
		expect(unitsFor(a, "procurement", "aci")).toEqual([IAE])
		expect(unitsFor(a, "requester", "procurement", "aci", "admin")).toEqual([IAE])
	})

	test("o autor que é ACI da OM tria e emite parecer no PRÓPRIO processo", () => {
		const a = access(allFourAtIae)
		const own = { user_id: ME, unit_id: IAE }
		expect(decideSubmissionRead(a, ME, own)).toBe(true)
		expect(decideSubmissionReview(a, own)).toBe(true)
	})

	test("e decide também o processo do colega da mesma OM", () => {
		const a = access(allFourAtIae)
		const colleague = { user_id: COLLEAGUE, unit_id: IAE }
		expect(decideSubmissionRead(a, ME, colleague)).toBe(true)
		expect(decideSubmissionReview(a, colleague)).toBe(true)
	})

	test("acumular papéis não alarga o escopo: fora da OM, nada", () => {
		const a = access(allFourAtIae)
		expect(decideSubmissionRead(a, ME, { user_id: COLLEAGUE, unit_id: GAP_SJ })).toBe(false)
		expect(decideSubmissionReview(a, { user_id: ME, unit_id: GAP_SJ })).toBe(false)
	})

	test("papéis acumulados em OMs diferentes: cada um no seu escopo", () => {
		const a = access([grant("alpha-requester", 1, IEFA), grant("alpha-aci", 1, IAE), grant("alpha-procurement", 1, GAP_SJ)])
		expect(a.roles).toEqual({ requester: [IEFA], procurement: [GAP_SJ, IAE, DCTA, IEFA], aci: [IAE], admin: [] })
		expect(decideSubmissionReview(a, { user_id: ME, unit_id: IAE })).toBe(true)
		expect(decideSubmissionReview(a, { user_id: ME, unit_id: IEFA })).toBe(false)
	})

	test("o bloqueio no copiloto (deny sem escopo nos quatro) derruba todos os papéis e o envio", () => {
		const blocked = access([...allFourAtIae, ...(["alpha-requester", "alpha-procurement", "alpha-aci", "alpha-admin"] as const).map((m) => grant(m, 0))])
		expect(blocked.roles).toEqual({ requester: [], procurement: [], aci: [], admin: [] })
		expect(blocked.canSubmit).toBe(false)
		// O autor segue lendo o que ele mesmo enviou — como qualquer conta sem papel.
		expect(decideSubmissionRead(blocked, ME, { user_id: ME, unit_id: IAE })).toBe(true)
		expect(decideSubmissionReview(blocked, { user_id: ME, unit_id: IAE })).toBe(false)
	})
})

describe("decideThreadAccess — conversa do chat é do dono", () => {
	test("o dono lê", () => {
		expect(decideThreadAccess({ user_id: "u-1" }, "u-1")).toBe(true)
	})

	test("outra pessoa não lê — nem o ACI da OM do processo", () => {
		expect(decideThreadAccess({ user_id: "u-1" }, "u-2")).toBe(false)
	})

	test("conversa inexistente dá a mesma resposta que a de outra pessoa", () => {
		expect(decideThreadAccess(null, "u-2")).toBe(decideThreadAccess({ user_id: "u-1" }, "u-2"))
	})
})
