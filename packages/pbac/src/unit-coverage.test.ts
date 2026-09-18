import { describe, expect, test } from "bun:test"
import type { AppModule, UserPermission } from "./types.ts"
import {
	assertGrantable,
	coversUnit,
	expandSupportCoverage,
	fetchUnitSupportGraph,
	GrantNotAllowedError,
	type GrantRefusal,
	needsSupportGraph,
	resolveModuleUnitCoverage,
	type UnitSupportEdge,
	unionCoverage,
} from "./unit-coverage.ts"

// GAP-SJ (26) apoia IAE (100), DCTA (101) e IEFA (102). GAP-RJ (10) não apoia ninguém.
// Um nível a mais (103, apoiada pelo IAE) prova a transitividade.
const GAP_SJ = 26
const GAP_RJ = 10
const IAE = 100
const DCTA = 101
const IEFA = 102
const IAE_CHILD = 103

const GRAPH: UnitSupportEdge[] = [
	{ id: GAP_RJ, supporting_unit_id: null },
	{ id: GAP_SJ, supporting_unit_id: null },
	{ id: IAE, supporting_unit_id: GAP_SJ },
	{ id: DCTA, supporting_unit_id: GAP_SJ },
	{ id: IEFA, supporting_unit_id: GAP_SJ },
	{ id: IAE_CHILD, supporting_unit_id: IAE },
]

function grant(module: AppModule, level: number, unit_id: number | null = null): UserPermission {
	return { module, level, mess_hall_id: null, kitchen_id: null, unit_id }
}

describe("expandSupportCoverage", () => {
	test("a apoiadora cobre as apoiadas, transitivamente", () => {
		expect(expandSupportCoverage([GAP_SJ], GRAPH)).toEqual([GAP_SJ, IAE, DCTA, IEFA, IAE_CHILD].sort((a, b) => a - b))
	})

	test("a apoiada NÃO cobre a apoiadora nem as irmãs", () => {
		expect(expandSupportCoverage([IAE], GRAPH)).toEqual([IAE, IAE_CHILD])
		expect(expandSupportCoverage([DCTA], GRAPH)).toEqual([DCTA])
	})

	test("ciclo não trava e auto-apoio é ignorado", () => {
		const cyclic: UnitSupportEdge[] = [
			{ id: 1, supporting_unit_id: 2 },
			{ id: 2, supporting_unit_id: 1 },
			{ id: 3, supporting_unit_id: 3 },
		]
		expect(expandSupportCoverage([1], cyclic)).toEqual([1, 2])
		expect(expandSupportCoverage([3], cyclic)).toEqual([3])
	})
})

describe("coversUnit / unionCoverage", () => {
	test("unidade nula só é coberta por 'all'", () => {
		expect(coversUnit("all", null)).toBe(true)
		expect(coversUnit([GAP_SJ], null)).toBe(false)
		expect(coversUnit([GAP_SJ], GAP_SJ)).toBe(true)
		expect(coversUnit([], GAP_SJ)).toBe(false)
	})

	test("'all' absorve a união; listas se juntam sem repetir", () => {
		expect(unionCoverage([1], "all")).toBe("all")
		expect(unionCoverage([3, 1], [1, 2], [])).toEqual([1, 2, 3])
	})
})

describe("resolveModuleUnitCoverage", () => {
	test("allow global sem deny é 'all' e dispensa o grafo", () => {
		expect(resolveModuleUnitCoverage([grant("alpha-aci", 1)], "alpha-aci", null)).toBe("all")
	})

	test("sem grant é vazio e dispensa o grafo", () => {
		expect(resolveModuleUnitCoverage([grant("alpha-requester", 1, GAP_SJ)], "alpha-aci", null)).toEqual([])
	})

	test("grant na apoiadora cobre as apoiadas; grant na apoiada, só ela (e as que ela apoia)", () => {
		expect(resolveModuleUnitCoverage([grant("alpha-procurement", 1, GAP_SJ)], "alpha-procurement", GRAPH)).toEqual(
			[GAP_SJ, IAE, DCTA, IEFA, IAE_CHILD].sort((a, b) => a - b)
		)
		expect(resolveModuleUnitCoverage([grant("alpha-procurement", 1, DCTA)], "alpha-procurement", GRAPH)).toEqual([DCTA])
	})

	test("deny escopado recorta uma OM do allow GLOBAL — que deixa de ser 'all'", () => {
		const coverage = resolveModuleUnitCoverage([grant("alpha-aci", 1), grant("alpha-aci", 0, GAP_RJ)], "alpha-aci", GRAPH)

		expect(coverage).not.toBe("all")
		expect(coversUnit(coverage, GAP_RJ)).toBe(false)
		expect(coversUnit(coverage, GAP_SJ)).toBe(true)
		// E o registro sem OM, que só o global de verdade alcança, também sai.
		expect(coversUnit(coverage, null)).toBe(false)
	})

	test("deny na apoiadora desce para as apoiadas, mesmo com allow direto na apoiada", () => {
		const coverage = resolveModuleUnitCoverage([grant("alpha-aci", 1, IAE), grant("alpha-aci", 1, GAP_RJ), grant("alpha-aci", 0, GAP_SJ)], "alpha-aci", GRAPH)

		expect(coverage).toEqual([GAP_RJ])
	})

	test("deny sem escopo zera o módulo", () => {
		expect(resolveModuleUnitCoverage([grant("alpha-aci", 1, GAP_SJ), grant("alpha-aci", 0)], "alpha-aci", GRAPH)).toEqual([])
	})

	test("minLevel: alpha-admin só conta no nível 3", () => {
		expect(resolveModuleUnitCoverage([grant("alpha-admin", 1, GAP_SJ)], "alpha-admin", GRAPH, 3)).toEqual([])
		expect(resolveModuleUnitCoverage([grant("alpha-admin", 3, IAE)], "alpha-admin", GRAPH, 3)).toEqual([IAE, IAE_CHILD])
	})

	test("permissão escopada sem grafo é erro de programação, não cobertura vazia", () => {
		expect(() => resolveModuleUnitCoverage([grant("alpha-aci", 1, GAP_SJ)], "alpha-aci", null)).toThrow()
	})

	test("needsSupportGraph só liga com escopo de unidade nos módulos pedidos", () => {
		expect(needsSupportGraph([grant("alpha-aci", 1)], ["alpha-aci"])).toBe(false)
		expect(needsSupportGraph([grant("unit", 1, 3)], ["alpha-aci"])).toBe(false)
		expect(needsSupportGraph([grant("alpha-aci", 0, 3)], ["alpha-aci"])).toBe(true)
	})
})

describe("assertGrantable", () => {
	const ADMIN = "admin-1"
	const OTHER = "user-2"

	function refusal(fn: () => void): GrantRefusal | null {
		try {
			fn()
			return null
		} catch (error) {
			if (error instanceof GrantNotAllowedError) return error.reason
			throw error
		}
	}

	const scopedAdmin = { actorId: ADMIN, coverage: expandSupportCoverage([GAP_SJ], GRAPH) }
	const apoiadaAdmin = { actorId: ADMIN, coverage: expandSupportCoverage([IAE], GRAPH) }

	test("admin global concede qualquer OM e o global", () => {
		expect(refusal(() => assertGrantable({ actorId: ADMIN, coverage: "all" }, { userId: OTHER, unitId: null }))).toBeNull()
		expect(refusal(() => assertGrantable({ actorId: ADMIN, coverage: "all" }, { userId: OTHER, unitId: GAP_RJ }))).toBeNull()
	})

	test("admin da apoiadora concede na própria OM e nas apoiadas", () => {
		expect(refusal(() => assertGrantable(scopedAdmin, { userId: OTHER, unitId: GAP_SJ }))).toBeNull()
		expect(refusal(() => assertGrantable(scopedAdmin, { userId: OTHER, unitId: IEFA }))).toBeNull()
	})

	test("escopado → global: recusado", () => {
		expect(refusal(() => assertGrantable(scopedAdmin, { userId: OTHER, unitId: null }))).toBe("GLOBAL_REQUIRES_GLOBAL_ADMIN")
	})

	test("escopado → outra OM: recusado", () => {
		expect(refusal(() => assertGrantable(scopedAdmin, { userId: OTHER, unitId: GAP_RJ }))).toBe("OUTSIDE_COVERAGE")
	})

	test("escopado na apoiada → apoiadora da própria OM (o inverso): recusado", () => {
		expect(refusal(() => assertGrantable(apoiadaAdmin, { userId: OTHER, unitId: GAP_SJ }))).toBe("OUTSIDE_COVERAGE")
		expect(refusal(() => assertGrantable(apoiadaAdmin, { userId: OTHER, unitId: DCTA }))).toBe("OUTSIDE_COVERAGE")
	})

	test("sobre si mesmo: recusado — inclusive para o admin global", () => {
		expect(refusal(() => assertGrantable({ actorId: ADMIN, coverage: "all" }, { userId: ADMIN, unitId: GAP_SJ }))).toBe("SELF")
		expect(refusal(() => assertGrantable(scopedAdmin, { userId: ADMIN, unitId: IAE }))).toBe("SELF")
	})

	test("sem cobertura nenhuma (não é admin): recusado", () => {
		expect(refusal(() => assertGrantable({ actorId: ADMIN, coverage: [] }, { userId: OTHER, unitId: GAP_SJ }))).toBe("OUTSIDE_COVERAGE")
	})

	test("a mensagem é a frase para o usuário", () => {
		expect(() => assertGrantable(scopedAdmin, { userId: OTHER, unitId: null })).toThrow(/administrador global/)
	})
})

describe("fetchUnitSupportGraph", () => {
	function stub(result: { data: UnitSupportEdge[] | null; error: { message: string } | null }) {
		return {
			from: (table: string) => {
				expect(table).toBe("units")
				return { select: () => ({ order: () => ({ limit: () => result }) }) }
			},
		}
	}

	test("devolve as arestas", async () => {
		expect(await fetchUnitSupportGraph(stub({ data: GRAPH, error: null }) as never)).toEqual(GRAPH)
	})

	test("erro de leitura propaga — cobertura vazia por falha seria um deny silencioso", async () => {
		await expect(fetchUnitSupportGraph(stub({ data: null, error: { message: "boom" } }) as never)).rejects.toThrow("boom")
	})

	test("grafo no teto do PostgREST falha em vez de encolher a cobertura", async () => {
		const full = Array.from({ length: 1000 }, (_, id) => ({ id, supporting_unit_id: null }))
		await expect(fetchUnitSupportGraph(stub({ data: full, error: null }) as never)).rejects.toThrow(/truncada/)
	})
})
