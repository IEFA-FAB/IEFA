import { describe, expect, test } from "bun:test"
import { resolveEffectivePermissions, type UserPermission } from "@iefa/pbac"
import {
	canDesignateInUnit,
	DEFINITIVE_RECEIPT_ROLES,
	DESIGNATION_SCREEN_LABEL,
	designationInputProblems,
	designationMissingMessage,
	isCandidateOnlyViaGlobalAccess,
	isDesignationActive,
	isDesignationCandidate,
	PROVISIONAL_RECEIPT_ROLES,
	planEndDesignation,
	selfDesignationProblem,
} from "./designations.ts"

describe("designationMissingMessage", () => {
	test("provisório e definitivo exigem designação e citam a alínea do art. 140, II", () => {
		expect(designationMissingMessage("provisional", false)).toMatch(/art\. 140, II, a/)
		expect(designationMissingMessage("definitive", false)).toMatch(/art\. 140, II, b/)
	})

	test("quem não pode designar lê quem designa e onde; a conferência fica", () => {
		const message = designationMissingMessage("definitive", false)
		expect(message).toContain("quem tem Gestão Unidade")
		expect(message).not.toMatch(/chefe/i)
		expect(message).toContain(DESIGNATION_SCREEN_LABEL)
		expect(message).toMatch(/conferência já registrada fica/)
	})

	test("quem pode designar é mandado designar ali mesmo", () => {
		expect(designationMissingMessage("provisional", true)).toMatch(/Designe agora/)
		expect(designationMissingMessage("provisional", true)).not.toContain(DESIGNATION_SCREEN_LABEL)
	})
})

describe("papéis", () => {
	test("o definitivo é de gestor do contrato, gestor setorial ou comissão; o provisório aceita também os fiscais", () => {
		// Decreto 11.246/2022, art. 25, na redação do Decreto 13.031/2026.
		expect(DEFINITIVE_RECEIPT_ROLES).toEqual(["gestor", "gestor_setorial", "membro_comissao"])
		for (const role of DEFINITIVE_RECEIPT_ROLES) expect(PROVISIONAL_RECEIPT_ROLES).toContain(role)
		expect(PROVISIONAL_RECEIPT_ROLES).toContain("fiscal_tecnico")
		expect(PROVISIONAL_RECEIPT_ROLES).toContain("fiscal_setorial")
	})
})

describe("designationInputProblems", () => {
	const ok = {
		source: "ato" as const,
		sourceReference: "BI nº 123/2026",
		validFrom: "2026-09-01",
		validTo: null,
		empenhoId: null,
		arpId: null,
		acquisitionId: null,
	}

	test("ato com referência e início passa", () => {
		expect(designationInputProblems(ok)).toEqual([])
	})

	test("ato sem número do boletim ou portaria é recusado — também o permanente", () => {
		expect(designationInputProblems({ ...ok, sourceReference: "  " })[0]).toMatch(/boletim interno ou da portaria/)
		expect(designationInputProblems({ ...ok, source: "permanente", sourceReference: null })).toHaveLength(1)
	})

	test("vigência invertida e dois vínculos ao mesmo tempo", () => {
		expect(designationInputProblems({ ...ok, validTo: "2026-08-01" })[0]).toMatch(/anterior ao início/)
		expect(designationInputProblems({ ...ok, empenhoId: "e", arpId: "a" })[0]).toMatch(/UMA contratação, ARP ou empenho/)
	})
})

describe("isDesignationActive", () => {
	test("vale do início ao fim, inclusive", () => {
		expect(isDesignationActive({ validFrom: "2026-09-01", validTo: null }, "2026-09-26")).toBe(true)
		expect(isDesignationActive({ validFrom: "2026-09-27", validTo: null }, "2026-09-26")).toBe(false)
		expect(isDesignationActive({ validFrom: "2026-01-01", validTo: "2026-09-26" }, "2026-09-26")).toBe(true)
		expect(isDesignationActive({ validFrom: "2026-01-01", validTo: "2026-09-25" }, "2026-09-26")).toBe(false)
	})
})

describe("planEndDesignation", () => {
	const today = "2026-09-26"

	test("destituído não assina no mesmo dia: a vigência termina ONTEM", () => {
		const plan = planEndDesignation({ validFrom: "2026-01-10", validTo: null, today, usedByReceipt: true })
		expect(plan).toEqual({ action: "end", validTo: "2026-09-25" })
		// e a busca (valid_to >= hoje) deixa de achá-la hoje
		expect(isDesignationActive({ validFrom: "2026-01-10", validTo: "2026-09-25" }, today)).toBe(false)
	})

	test("vira o mês e o ano", () => {
		expect(planEndDesignation({ validFrom: "2025-06-01", validTo: null, today: "2026-01-01", usedByReceipt: false })).toEqual({
			action: "end",
			validTo: "2025-12-31",
		})
	})

	test("a que começa hoje (ou depois) e nenhum termo usou é removida", () => {
		expect(planEndDesignation({ validFrom: today, validTo: null, today, usedByReceipt: false })).toEqual({ action: "remove" })
		expect(planEndDesignation({ validFrom: "2026-10-01", validTo: null, today, usedByReceipt: false })).toEqual({ action: "remove" })
	})

	test("a que começou hoje e já sustenta termo não se apaga; a já encerrada não se encerra de novo", () => {
		expect(planEndDesignation({ validFrom: today, validTo: null, today, usedByReceipt: true })).toMatchObject({
			action: "refuse",
			code: "DESIGNATION_IN_USE_TODAY",
		})
		expect(planEndDesignation({ validFrom: "2026-01-01", validTo: "2026-09-01", today, usedByReceipt: true })).toMatchObject({
			action: "refuse",
			code: "DESIGNATION_ALREADY_ENDED",
		})
	})
})

describe("selfDesignationProblem (segregação de funções)", () => {
	const base = {
		isSelf: true,
		role: "gestor" as const,
		designatorCanFinalize: true,
		unitDesignators: ["CAP SILVA", "TEN SOUZA"],
		globalDesignators: [] as string[],
	}

	test("quem efetiva o definitivo não se designa gestor nem comissão, e lê quem mais pode designar", () => {
		const problem = selfDesignationProblem(base)
		expect(problem).toMatch(/feita por outra pessoa/)
		expect(problem).toMatch(/art\. 7º, § 1º/)
		expect(problem).toContain("CAP SILVA, TEN SOUZA")
		expect(selfDesignationProblem({ ...base, role: "membro_comissao" })).not.toBeNull()
		expect(selfDesignationProblem({ ...base, role: "gestor_setorial" })).not.toBeNull()
	})

	test("unidade de uma pessoa só: a recusa diz o caminho", () => {
		const problem = selfDesignationProblem({ ...base, unitDesignators: [] })
		expect(problem).toMatch(/Ninguém mais tem Gestão Unidade nível 2/)
		expect(problem).toMatch(/comandante designe outro servidor/)
	})

	test("o pessoal da OM vem antes dos globais, que vêm marcados", () => {
		const globals = ["AAA SUPORTE", "BBB SUPORTE", "CCC SUPORTE", "DDD SUPORTE", "EEE SUPORTE"]
		const problem = selfDesignationProblem({ ...base, unitDesignators: ["TEN SOUZA"], globalDesignators: globals }) as string
		expect(problem).toContain("Quem pode designar: TEN SOUZA, AAA SUPORTE (acesso global)")
		expect(problem).toMatch(/…\.$/)
		expect(problem).not.toMatch(/Ninguém mais/)
	})

	test("sem ninguém da OM, diz isso e aponta os globais disponíveis", () => {
		const problem = selfDesignationProblem({ ...base, unitDesignators: [], globalDesignators: ["MAJ ADMIN"] }) as string
		expect(problem).toMatch(/Ninguém mais tem Gestão Unidade nível 2 nesta OM/)
		expect(problem).toContain("com acesso global, pode designar: MAJ ADMIN (acesso global)")
	})

	test("designar outra pessoa, designar-se fiscal ou não poder efetivar passa", () => {
		expect(selfDesignationProblem({ ...base, isSelf: false })).toBeNull()
		expect(selfDesignationProblem({ ...base, role: "fiscal_tecnico" })).toBeNull()
		expect(selfDesignationProblem({ ...base, designatorCanFinalize: false })).toBeNull()
	})
})

describe("canDesignateInUnit", () => {
	const perm = (unitId: number | null, level = 2) => ({ module: "unit" as const, level, mess_hall_id: null, kitchen_id: null, unit_id: unitId })

	test("só unit:2 na unidade COMPRADORA", () => {
		expect(canDesignateInUnit([perm(7)], 7)).toBe(true)
		expect(canDesignateInUnit([perm(8)], 7)).toBe(false)
		expect(canDesignateInUnit([perm(7, 1)], 7)).toBe(false)
		expect(canDesignateInUnit([perm(7)], null)).toBe(false)
	})

	test("unit:2 global designa em qualquer OM, como no guard; deny global ou na OM tira", () => {
		expect(canDesignateInUnit([perm(null)], 7)).toBe(true)
		expect(canDesignateInUnit(resolveEffectivePermissions([perm(null)], [perm(7, 0)]), 7)).toBe(false)
		expect(canDesignateInUnit(resolveEffectivePermissions([perm(7)], [perm(null, 0)]), 7)).toBe(false)
		expect(canDesignateInUnit(resolveEffectivePermissions([perm(7)], [perm(7, 0)]), 7)).toBe(false)
		expect(canDesignateInUnit(resolveEffectivePermissions([], [perm(7)]), 7)).toBe(true)
	})
})

describe("isDesignationCandidate (resolução do pbac e dos guards)", () => {
	const grant = (module: "unit" | "storage", level: number, scope: { unit?: number; kitchen?: number } = {}): UserPermission => ({
		module,
		level,
		mess_hall_id: null,
		kitchen_id: scope.kitchen ?? null,
		unit_id: scope.unit ?? null,
	})
	const effective = (inline: UserPermission[], policy: UserPermission[] = []) => resolveEffectivePermissions(inline, policy)

	test("gestão da OM ou estoque de cozinha dela; outra OM e outra cozinha não", () => {
		expect(isDesignationCandidate(effective([grant("unit", 1, { unit: 7 })]), 7, [])).toBe(true)
		expect(isDesignationCandidate(effective([grant("storage", 1, { kitchen: 3 })]), 7, [3, 4])).toBe(true)
		expect(isDesignationCandidate(effective([grant("unit", 1, { unit: 8 })]), 7, [3])).toBe(false)
		expect(isDesignationCandidate(effective([grant("storage", 2, { kitchen: 9 })]), 7, [3])).toBe(false)
	})

	test("acesso escopado só por política anexada conta", () => {
		expect(isDesignationCandidate(effective([], [grant("storage", 1, { kitchen: 3 })]), 7, [3])).toBe(true)
		expect(isDesignationCandidate(effective([], [grant("unit", 1, { unit: 7 })]), 7, [])).toBe(true)
	})

	test("deny de qualquer origem precede o allow", () => {
		expect(isDesignationCandidate(effective([grant("storage", 0, { kitchen: 3 })], [grant("storage", 2, { kitchen: 3 })]), 7, [3])).toBe(false)
		expect(isDesignationCandidate(effective([grant("unit", 2, { unit: 7 })], [grant("unit", 0)]), 7, [])).toBe(false)
		// Escopado na OM + deny global: fora.
		expect(isDesignationCandidate(effective([grant("storage", 1, { kitchen: 3 })], [grant("storage", 0)]), 7, [3])).toBe(false)
		// Deny numa cozinha não tira quem opera outra cozinha da OM.
		expect(isDesignationCandidate(effective([grant("storage", 1, { kitchen: 4 })], [grant("storage", 0, { kitchen: 3 })]), 7, [3, 4])).toBe(true)
	})

	test("allow sem escopo (acesso global) é candidato em qualquer OM; deny na OM tira", () => {
		expect(isDesignationCandidate(effective([grant("unit", 2)]), 7, [])).toBe(true)
		expect(isDesignationCandidate(effective([], [grant("storage", 1)]), 7, [3])).toBe(true)
		expect(isDesignationCandidate(effective([grant("unit", 2)], [grant("unit", 0, { unit: 7 })]), 7, [])).toBe(false)
	})

	test("só comensal não é candidato", () => {
		expect(isDesignationCandidate(effective([]), 7, [3])).toBe(false)
	})
})

describe("isCandidateOnlyViaGlobalAccess (marca da lista)", () => {
	const grant = (module: "unit" | "storage", level: number, scope: { unit?: number; kitchen?: number } = {}): UserPermission => ({
		module,
		level,
		mess_hall_id: null,
		kitchen_id: scope.kitchen ?? null,
		unit_id: scope.unit ?? null,
	})

	test("marca quem só entra pelo acesso sem escopo", () => {
		expect(isCandidateOnlyViaGlobalAccess(resolveEffectivePermissions([grant("unit", 2)]), 7, [3])).toBe(true)
		expect(isCandidateOnlyViaGlobalAccess(resolveEffectivePermissions([], [grant("storage", 1)]), 7, [3])).toBe(true)
	})

	test("não marca quem também tem acesso escopado na OM, nem quem não é candidato", () => {
		expect(isCandidateOnlyViaGlobalAccess(resolveEffectivePermissions([grant("unit", 2), grant("storage", 1, { kitchen: 3 })]), 7, [3])).toBe(false)
		expect(isCandidateOnlyViaGlobalAccess(resolveEffectivePermissions([grant("unit", 1, { unit: 7 })]), 7, [])).toBe(false)
		expect(isCandidateOnlyViaGlobalAccess(resolveEffectivePermissions([grant("unit", 2)], [grant("unit", 0)]), 7, [])).toBe(false)
	})
})
