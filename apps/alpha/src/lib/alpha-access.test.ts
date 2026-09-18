import { describe, expect, test } from "bun:test"
import type { UnitSupportEdge, UserPermission } from "@iefa/pbac"
import {
	type AlphaAccess,
	coversUnit,
	decideSubmissionRead,
	decideSubmissionReview,
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

	test("o módulo `alpha` antigo não é mais lido — nem o allow, nem o deny", () => {
		const legacy = access([grant("alpha", 3), grant("alpha", 0)])
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
		expect(decideSubmissionRead(access([]), ME, { user_id: ME, unit_id: null })).toBe(true)
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

	test("submissão sem OM: só o autor e o papel global", () => {
		expect(decideSubmissionRead(access([grant("alpha-aci", 1, GAP_SJ)]), ME, { user_id: COLLEAGUE, unit_id: null })).toBe(false)
		expect(decideSubmissionRead(access([grant("alpha-aci", 1)]), ME, { user_id: COLLEAGUE, unit_id: null })).toBe(true)
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
		expect(legacyAccessFields(access([grant("alpha-aci", 1, IAE), grant("alpha-admin", 3, IAE)]))).toEqual({
			level: 3,
			can_see_all: true,
			can_decide: true,
			can_manage_access: true,
		})
	})

	test("o backfill (quatro papéis globais) reproduz exatamente o ACI + admin de antes", () => {
		const backfilled = access([grant("alpha-requester", 1), grant("alpha-procurement", 1), grant("alpha-aci", 1), grant("alpha-admin", 3)])
		expect(legacyAccessFields(backfilled)).toEqual({ level: 3, can_see_all: true, can_decide: true, can_manage_access: true })
	})
})
