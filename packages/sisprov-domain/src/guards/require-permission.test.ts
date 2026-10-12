import { describe, expect, test } from "bun:test"
import type { UnitSupportEdge, UserContext, UserPermission } from "@iefa/pbac"
import { PermissionDeniedError } from "../types/errors.ts"
import { requirePlanning, requireSisprovAdmin, requireSisprovApp, requireSupply } from "./require-permission.ts"

const GAP_SJ = 26
const IAE = 31
const DCTA = 32
const GAP_SP = 40

/** GAP-SJ apoia IAE e DCTA; GAP-SP não apoia ninguém. */
const GRAPH: UnitSupportEdge[] = [
	{ id: GAP_SJ, supporting_unit_id: null },
	{ id: IAE, supporting_unit_id: GAP_SJ },
	{ id: DCTA, supporting_unit_id: GAP_SJ },
	{ id: GAP_SP, supporting_unit_id: null },
]

function grant(module: UserPermission["module"], level: number, unitId: number | null = null): UserPermission {
	return { module, level, unit_id: unitId, kitchen_id: null, mess_hall_id: null }
}

function ctx(...permissions: UserPermission[]): UserContext {
	return { userId: "u", email: "u@fab.mil.br", permissions, aal: 1, lastFactorAt: null, credentialOrigin: "session" } as unknown as UserContext
}

describe("guards por OM com hierarquia de apoio", () => {
	test("grant na apoiadora cobre a apoiada; o inverso não", () => {
		const supplyAtGapSj = ctx(grant("sisprov-supply", 2, GAP_SJ))
		expect(() => requireSupply(supplyAtGapSj, 2, { unitId: IAE, supportGraph: GRAPH })).not.toThrow()
		expect(() => requireSupply(supplyAtGapSj, 2, { unitId: GAP_SP, supportGraph: GRAPH })).toThrow(PermissionDeniedError)

		const supplyAtIae = ctx(grant("sisprov-supply", 2, IAE))
		expect(() => requireSupply(supplyAtIae, 2, { unitId: GAP_SJ, supportGraph: GRAPH })).toThrow(PermissionDeniedError)
	})

	test("sem grafo, só o escopo direto ou o global valem", () => {
		const supplyAtGapSj = ctx(grant("sisprov-supply", 2, GAP_SJ))
		expect(() => requireSupply(supplyAtGapSj, 2, { unitId: IAE })).toThrow(PermissionDeniedError)
		expect(() => requireSupply(ctx(grant("sisprov-supply", 2)), 2, { unitId: IAE })).not.toThrow()
	})

	test("papéis são independentes na mesma OM", () => {
		const onlySupply = ctx(grant("sisprov-supply", 2, IAE))
		expect(() => requireSupply(onlySupply, 2, { unitId: IAE })).not.toThrow()
		expect(() => requirePlanning(onlySupply, 1, { unitId: IAE })).toThrow(PermissionDeniedError)
	})

	test("nível insuficiente é recusado mesmo no escopo certo", () => {
		expect(() => requirePlanning(ctx(grant("sisprov-planning", 1, IAE)), 2, { unitId: IAE })).toThrow(PermissionDeniedError)
	})

	test("deny na OM alvo vence o allow da apoiadora", () => {
		const blocked = ctx(grant("sisprov-supply", 2, GAP_SJ), grant("sisprov-supply", 0, IAE))
		expect(() => requireSupply(blocked, 2, { unitId: IAE, supportGraph: GRAPH })).toThrow(PermissionDeniedError)
		expect(() => requireSupply(blocked, 2, { unitId: DCTA, supportGraph: GRAPH })).not.toThrow()
	})

	test("deny escopado recorta um allow global", () => {
		const denied = ctx(grant("sisprov-planning", 2), grant("sisprov-planning", 0, DCTA))
		expect(() => requirePlanning(denied, 2, { unitId: IAE })).not.toThrow()
		expect(() => requirePlanning(denied, 2, { unitId: DCTA })).toThrow(PermissionDeniedError)
	})
})

describe("requireSisprovAdmin", () => {
	test("sem OM alvo exige o grant GLOBAL: um grant escopado não dá gestão sistêmica", () => {
		expect(() => requireSisprovAdmin(ctx(grant("sisprov-admin", 2, GAP_SJ)), 2)).toThrow(PermissionDeniedError)
		expect(() => requireSisprovAdmin(ctx(grant("sisprov-admin", 2)), 2)).not.toThrow()
	})

	test("com OM alvo aceita o grant escopado que a cobre", () => {
		expect(() => requireSisprovAdmin(ctx(grant("sisprov-admin", 2, GAP_SJ)), 2, { unitId: IAE, supportGraph: GRAPH })).not.toThrow()
	})
})

describe("requireSisprovApp", () => {
	test("qualquer módulo do app no nível 1 basta; módulo de outro app não", () => {
		expect(() => requireSisprovApp(ctx(grant("sisprov-planning", 1, IAE)))).not.toThrow()
		expect(() => requireSisprovApp(ctx(grant("storage", 3), grant("global", 3)))).toThrow(PermissionDeniedError)
	})
})
