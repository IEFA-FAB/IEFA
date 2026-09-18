import { describe, expect, test } from "bun:test"
import type { UnitOption } from "@iefa/alpha-client/access"
import { UNITS } from "@/test/access-fixture"
import { ALL_UNITS_SCOPE, buildScopeOptions, describeScope, groupUnitsBySupport, PERSONAL_SCOPE, pickScopeForUnit, resolveScopeParam } from "./scope"

describe("buildScopeOptions", () => {
	test("cobertura global: `todas` primeiro, depois cada OM pela sigla", () => {
		expect(buildScopeOptions("all", UNITS).map((option) => option.id)).toEqual([ALL_UNITS_SCOPE, "101", "10", "26", "100"])
	})

	test("lista: só as OMs cobertas, com sigla e nome por extenso", () => {
		const options = buildScopeOptions([100, 26], UNITS)
		expect(options.map((option) => option.label)).toEqual(["GAP-SJ", "IAE"])
		expect(options[1]).toMatchObject({ id: "100", kind: "unit", unitId: 100, caption: "Instituto de Aeronáutica e Espaço" })
	})

	test("nome igual à sigla não vira segunda linha", () => {
		expect(buildScopeOptions([101], UNITS)[0]?.caption).toBeNull()
	})

	test("OM coberta fora do cadastro ainda é opção — some o nome, não o acesso", () => {
		expect(buildScopeOptions([999], UNITS)[0]).toMatchObject({ id: "999", label: "OM 999" })
	})

	test("vazia: nada, ou só `minhas` quando o módulo oferece", () => {
		expect(buildScopeOptions([], UNITS)).toEqual([])
		expect(buildScopeOptions([], UNITS, { personalWhenEmpty: true }).map((option) => option.id)).toEqual([PERSONAL_SCOPE])
	})

	test("quem tem OM não recebe `minhas`", () => {
		expect(buildScopeOptions([26], UNITS, { personalWhenEmpty: true }).map((option) => option.id)).toEqual(["26"])
	})
})

describe("resolveScopeParam", () => {
	const scoped = buildScopeOptions([26, 100], UNITS)
	const global = buildScopeOptions("all", UNITS)

	test("id numérico dentro da cobertura", () => {
		expect(resolveScopeParam("26", scoped)?.unitId).toBe(26)
	})

	test("id fora da cobertura: null (volta ao hub)", () => {
		expect(resolveScopeParam("10", scoped)).toBeNull()
	})

	test("`todas` só com cobertura global", () => {
		expect(resolveScopeParam(ALL_UNITS_SCOPE, global)?.kind).toBe("all")
		expect(resolveScopeParam(ALL_UNITS_SCOPE, scoped)).toBeNull()
	})

	test("`minhas` só onde é oferecido", () => {
		expect(resolveScopeParam(PERSONAL_SCOPE, scoped)).toBeNull()
		expect(resolveScopeParam(PERSONAL_SCOPE, buildScopeOptions([], UNITS, { personalWhenEmpty: true }))?.kind).toBe("personal")
	})

	test("só a forma canônica: sem zero à esquerda, espaço ou texto", () => {
		for (const raw of ["026", " 26", "26 ", "gap-sj", "processos", ""]) expect(resolveScopeParam(raw, scoped)).toBeNull()
	})
})

describe("pickScopeForUnit", () => {
	test("a OM do processo, quando coberta", () => {
		expect(pickScopeForUnit(buildScopeOptions([26, 100], UNITS), 100)?.id).toBe("100")
	})

	test("global: a OM se estiver na lista; `todas` para registro sem OM", () => {
		const global = buildScopeOptions("all", UNITS)
		expect(pickScopeForUnit(global, 26)?.id).toBe("26")
		expect(pickScopeForUnit(global, null)?.id).toBe(ALL_UNITS_SCOPE)
	})

	test("sem cobertura mas com `minhas`: `minhas`", () => {
		expect(pickScopeForUnit(buildScopeOptions([], UNITS, { personalWhenEmpty: true }), 26)?.id).toBe(PERSONAL_SCOPE)
	})

	test("OM fora da cobertura, sem `todas` nem `minhas`: null", () => {
		expect(pickScopeForUnit(buildScopeOptions([26], UNITS), 10)).toBeNull()
		expect(pickScopeForUnit(buildScopeOptions([26], UNITS), null)).toBeNull()
	})
})

describe("describeScope", () => {
	test("resumos do cartão", () => {
		expect(describeScope(buildScopeOptions([26], UNITS))).toBe("GAP-SJ")
		expect(describeScope(buildScopeOptions([26, 100, 101], UNITS))).toBe("3 OMs")
		expect(describeScope(buildScopeOptions("all", UNITS))).toBe("Todas as OMs")
		expect(describeScope(buildScopeOptions([], UNITS, { personalWhenEmpty: true }))).toBe("Minhas submissões")
		expect(describeScope([])).toBeNull()
	})
})

describe("groupUnitsBySupport", () => {
	const unit = (id: number, code: string, supporting_unit_id: number | null): UnitOption => ({ id, code, display_name: null, supporting_unit_id })

	test("a apoiadora abre o grupo, as apoiadas seguem pela sigla, e as avulsas vão para o fim", () => {
		const groups = groupUnitsBySupport([unit(100, "IAE", 26), unit(10, "GAP-RJ", null), unit(101, "DCTA", 26), unit(26, "GAP-SJ", null), unit(5, "BAAN", null)])
		expect(groups.map((group) => [group.label, group.units.map((u) => u.code)])).toEqual([
			["Apoio GAP-SJ", ["GAP-SJ", "DCTA", "IAE"]],
			["Demais OMs", ["BAAN", "GAP-RJ"]],
		])
	})

	test("apoiadora fora da lista não forma grupo", () => {
		const groups = groupUnitsBySupport([unit(100, "IAE", 999)])
		expect(groups).toEqual([{ supportingUnitId: null, label: "Demais OMs", units: [unit(100, "IAE", 999)] }])
	})

	test("auto-apoio não conta como apoio", () => {
		expect(groupUnitsBySupport([unit(26, "GAP-SJ", 26)])[0]?.label).toBe("Demais OMs")
	})
})
