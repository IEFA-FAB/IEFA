import { describe, expect, test } from "bun:test"
import {
	type AcquisitionFacts,
	acquisitionGaps,
	computeDispensaSum,
	type DirectContractLimitRow,
	type DispensaEntry,
	describeAcquisitionGaps,
	describeDispensaSum,
	dispensaValue,
	isAcquisitionComplete,
	normalizeActivityLine,
	resolveDirectContractLimit,
	suggestActivityLine,
} from "./acquisition.ts"

const EMPTY: AcquisitionFacts = {
	kind: "dispensa",
	srpRole: null,
	legalBasis: null,
	directContractClause: null,
	nd: null,
	activityLine: null,
	object: null,
	supplierCnpj: null,
	supplierName: null,
	validFrom: null,
	validTo: null,
	estimatedValue: null,
	overLimitJustification: null,
}

function must<T>(value: T | null): T {
	if (value == null) throw new Error("somatório esperado")
	return value
}

/** Limites conferidos no anexo dos decretos (planalto.gov.br). */
const LIMITS: DirectContractLimitRow[] = [
	{ clause: "II", validFrom: "2024-01-01", value: 59_906.02, sourceAct: "Decreto nº 11.871/2023" },
	{ clause: "II", validFrom: "2025-01-01", value: 62_725.59, sourceAct: "Decreto nº 12.343/2024" },
	{ clause: "II", validFrom: "2026-01-01", value: 65_492.11, sourceAct: "Decreto nº 12.807/2025" },
	{ clause: "I", validFrom: "2026-01-01", value: 130_984.2, sourceAct: "Decreto nº 12.807/2025" },
]

describe("completude da contratação", () => {
	test("dispensa só com o tipo é gravável e diz o que falta", () => {
		const gaps = acquisitionGaps(EMPTY)
		expect(gaps.map((g) => g.code)).toEqual(["legal_basis", "direct_contract_clause", "supplier", "validity", "object"])
		expect(describeAcquisitionGaps("dispensa", gaps.slice(0, 1).concat(gaps.slice(2, 4)))).toBe("Dispensa sem fundamento legal, sem fornecedor e sem vigência")
	})

	test("dispensa por valor cobra ramo de atividade e valor", () => {
		const gaps = acquisitionGaps({ ...EMPTY, directContractClause: "II" }).map((g) => g.code)
		expect(gaps).toContain("activity_line")
		expect(gaps).toContain("value")
	})

	test("acima do limite, só completa com justificativa", () => {
		const facts: AcquisitionFacts = {
			...EMPTY,
			legalBasis: "Lei 14.133/2021, art. 75, II",
			directContractClause: "II",
			activityLine: "8905",
			object: "Carne bovina",
			supplierName: "Frigorífico",
			validFrom: "2026-03-01",
			validTo: "2026-12-31",
			estimatedValue: 20_000,
		}
		expect(isAcquisitionComplete(facts)).toBe(true)
		expect(isAcquisitionComplete(facts, { overLimit: true })).toBe(false)
		expect(isAcquisitionComplete({ ...facts, overLimitJustification: "Demanda imprevisível da formatura" }, { overLimit: true })).toBe(true)
	})

	test("registro de preços cobra o papel da unidade, não o fornecedor", () => {
		const gaps = acquisitionGaps({ ...EMPTY, kind: "registro_precos" }).map((g) => g.code)
		expect(gaps).toContain("srp_role")
		expect(gaps).not.toContain("supplier")
		expect(gaps).not.toContain("direct_contract_clause")
	})

	test("suprimento de fundos não tem vigência a cobrar", () => {
		expect(acquisitionGaps({ ...EMPTY, kind: "suprimento_fundos" }).map((g) => g.code)).not.toContain("validity")
	})

	test("completa não tem frase de pendência", () => {
		expect(describeAcquisitionGaps("licitacao", [])).toBeNull()
	})
})

describe("limite vigente", () => {
	test("2026 usa o Decreto 12.807/2025", () => {
		const limit = resolveDirectContractLimit(LIMITS, "II", 2026)
		expect(limit.value).toBe(65_492.11)
		expect(limit.isOutdated).toBe(false)
	})

	test("ano sem linha usa o último conhecido e avisa", () => {
		const limit = resolveDirectContractLimit(LIMITS, "II", 2027)
		expect(limit.value).toBe(65_492.11)
		expect(limit.isOutdated).toBe(true)
	})

	test("ano anterior usa a linha do próprio ano", () => {
		expect(resolveDirectContractLimit(LIMITS, "II", 2024).value).toBe(59_906.02)
	})

	test("inciso sem linha nenhuma devolve limite nulo", () => {
		expect(resolveDirectContractLimit(LIMITS, "I", 2025)).toEqual({ value: null, validFrom: null, sourceAct: null, isOutdated: true })
	})
})

describe("somatório da dispensa (art. 75, § 1º)", () => {
	const entry = (id: string, patch: Partial<DispensaEntry> = {}): DispensaEntry => ({
		id,
		label: `Dispensa ${id}`,
		kind: "dispensa",
		directContractClause: "II",
		fiscalYear: 2026,
		activityLine: "8905",
		nd: "33903007",
		estimatedValue: null,
		committedValue: 0,
		...patch,
	})
	const limit = resolveDirectContractLimit(LIMITS, "II", 2026)

	test("terceira dispensa de carnes no ano passa do limite e mostra a composição", () => {
		const sum = computeDispensaSum({
			candidate: entry("c", { estimatedValue: 20_000 }),
			others: [entry("a", { estimatedValue: 30_000 }), entry("b", { committedValue: 18_000, estimatedValue: 15_000 })],
			limit,
		})
		expect(sum?.total).toBe(68_000)
		expect(sum?.exceeded).toBe(true)
		expect(sum?.remaining).toBe(-2507.89)
		expect(sum?.composition.map((p) => [p.id, p.value])).toEqual([
			["a", 30_000],
			["b", 18_000],
			["c", 20_000],
		])
		expect(describeDispensaSum(must(sum))).toContain("art. 75, § 1º")
	})

	test("outro ramo, outro inciso, outro ano e apagada ficam fora", () => {
		const sum = computeDispensaSum({
			candidate: entry("c", { estimatedValue: 10_000 }),
			others: [
				entry("x", { activityLine: "8915", estimatedValue: 50_000 }),
				entry("y", { directContractClause: "I", estimatedValue: 50_000 }),
				entry("z", { fiscalYear: 2025, estimatedValue: 50_000 }),
				entry("w", { estimatedValue: 50_000, deleted: true }),
				entry("v", { kind: "inexigibilidade", estimatedValue: 50_000 }),
			],
			limit,
		})
		expect(sum?.total).toBe(10_000)
		expect(sum?.exceeded).toBe(false)
		expect(describeDispensaSum(must(sum))).toBeNull()
	})

	test("dispensa sem valor não conta como zero: o total vira piso", () => {
		const sum = computeDispensaSum({ candidate: entry("c", { estimatedValue: 70_000 }), others: [entry("a")], limit })
		expect(sum?.isFloor).toBe(true)
		expect(sum?.composition.find((p) => p.id === "a")?.value).toBeNull()
		expect(describeDispensaSum(must(sum))).toContain("piso")
	})

	test("valor da dispensa é o maior entre empenhado e estimado", () => {
		expect(dispensaValue({ estimatedValue: 10_000, committedValue: 12_000 })).toBe(12_000)
		expect(dispensaValue({ estimatedValue: 10_000, committedValue: 4_000 })).toBe(10_000)
		expect(dispensaValue({ estimatedValue: null, committedValue: 0 })).toBeNull()
	})

	test("ramo de serviço compara a descrição sem caixa nem espaço", () => {
		expect(normalizeActivityLine("  Manutenção de   Câmara Fria ")).toBe("manutenção de câmara fria")
		const sum = computeDispensaSum({
			candidate: entry("c", { activityLine: "Manutenção de câmara fria", estimatedValue: 1_000 }),
			others: [entry("a", { activityLine: "MANUTENÇÃO DE CÂMARA FRIA", estimatedValue: 2_000 })],
			limit,
		})
		expect(sum?.total).toBe(3_000)
	})

	test("sem ramo, a ND faz as vezes de ramo", () => {
		const sum = computeDispensaSum({
			candidate: entry("c", { activityLine: null, estimatedValue: 1_000 }),
			others: [entry("a", { activityLine: null, estimatedValue: 2_000 }), entry("b", { estimatedValue: 5_000 })],
			limit,
		})
		expect(sum?.total).toBe(3_000)
	})

	test("inexigibilidade e dispensa de outros incisos não têm somatório", () => {
		expect(computeDispensaSum({ candidate: entry("c", { kind: "inexigibilidade" }), others: [], limit })).toBeNull()
		expect(computeDispensaSum({ candidate: entry("c", { directContractClause: "VIII" }), others: [], limit })).toBeNull()
	})

	test("sem limite cadastrado, o aviso pede o cadastro", () => {
		const sum = computeDispensaSum({ candidate: entry("c", { estimatedValue: 1 }), others: [], limit: resolveDirectContractLimit([], "II", 2026) })
		expect(describeDispensaSum(must(sum))).toContain("cadastre o limite vigente")
	})
})

describe("ramo de atividade sugerido pelos itens", () => {
	test("classe mais frequente, desempate pelo menor código", () => {
		expect(suggestActivityLine([8905, "8905", 8915, null])).toBe("8905")
		expect(suggestActivityLine([8915, 8905])).toBe("8905")
		expect(suggestActivityLine([null, undefined, "abc"])).toBeNull()
	})
})
