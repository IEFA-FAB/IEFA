import { describe, expect, test } from "bun:test"
import {
	type ClassifiedEmpenhoEntry,
	type CreditLineSnapshot,
	checkCreditForClassifiedEmpenho,
	commitmentForCreditLine,
	empenhoConsumesCreditLine,
	normalizeNdPrefix,
	pickCreditLineForEmpenho,
	sumCreditNotesForLine,
} from "./budget-math.ts"

const SNAPSHOT = "2026-07-20T12:00:00.000Z"
const NOW = Date.parse("2026-07-25T12:00:00.000Z")

const generos: CreditLineSnapshot = {
	ug: "120070",
	nd: "339030",
	ptres: "170963",
	fonte: "1000",
	competencia: "2026-07-01",
	dotacao: 100_000,
	empenhadoSiafi: 60_000,
	saldoSiafi: 40_000,
	snapshotAt: SNAPSHOT,
}

function empenho(overrides: Partial<ClassifiedEmpenhoEntry>): ClassifiedEmpenhoEntry {
	return {
		id: "e1",
		ug: "120070",
		nd: "33903007",
		ptres: "170963",
		fonte: "1000",
		exercicio: 2026,
		dataEmpenho: "2026-07-22",
		status: "ativo",
		valorVigente: 10_000,
		events: [],
		...overrides,
	}
}

describe("normalizeNdPrefix", () => {
	test("subelemento 00 vale como o elemento", () => {
		expect(normalizeNdPrefix("3.3.90.30.00")).toBe("339030")
		expect(normalizeNdPrefix("33903007")).toBe("33903007")
	})
})

describe("empenhoConsumesCreditLine", () => {
	test("ND do subelemento consome a linha do elemento", () => {
		expect(empenhoConsumesCreditLine(generos, empenho({}))).toBe(true)
	})

	test("outra ND, outro PTRES, outra fonte ou outro exercício não consomem", () => {
		expect(empenhoConsumesCreditLine(generos, empenho({ nd: "33903922" }))).toBe(false)
		expect(empenhoConsumesCreditLine(generos, empenho({ ptres: "999999" }))).toBe(false)
		expect(empenhoConsumesCreditLine(generos, empenho({ fonte: "0100" }))).toBe(false)
		expect(empenhoConsumesCreditLine(generos, empenho({ exercicio: 2025, dataEmpenho: "2025-12-30" }))).toBe(false)
	})

	test("empenho sem ND não é atribuível; sem PTRES conta (desconhecido não é diferente)", () => {
		expect(empenhoConsumesCreditLine(generos, empenho({ nd: null }))).toBe(false)
		expect(empenhoConsumesCreditLine(generos, empenho({ ptres: null }))).toBe(true)
	})
})

describe("commitmentForCreditLine", () => {
	test("soma só as NE da classificação da linha, pelo valor vigente", () => {
		const result = commitmentForCreditLine(generos, SNAPSHOT, [
			empenho({ id: "a", valorVigente: 12_000 }),
			// serviço de terceiros PJ (339039): outra ND, não consome o crédito de material
			empenho({ id: "b", nd: "33903922", valorVigente: 50_000 }),
			// anulada depois de registrada
			empenho({ id: "c", status: "anulado", valorVigente: 0 }),
		])
		expect(result.comprometimento).toBe(12_000)
		expect(result.empenhoIds).toEqual(["a"])
	})

	test("NE anterior ao snapshot entra só pelos eventos posteriores", () => {
		const result = commitmentForCreditLine(generos, SNAPSHOT, [
			empenho({
				id: "old",
				dataEmpenho: "2026-07-10",
				valorVigente: 20_000,
				events: [
					{ tipo: "reforco", valor: 3_000, data: "2026-07-15" }, // já no SIAFI
					{ tipo: "reforco", valor: 2_000, data: "2026-07-21" },
					{ tipo: "anulacao", valor: 500, data: "2026-07-23" },
					{ tipo: "rp_inscricao", valor: 9_999, data: "2026-07-24" },
				],
			}),
		])
		expect(result.comprometimento).toBe(1_500)
	})

	test("anulação total (nova ou legada) posterior ao snapshot devolve crédito", () => {
		const result = commitmentForCreditLine(generos, SNAPSHOT, [
			empenho({ id: "x", dataEmpenho: "2026-07-01", events: [{ tipo: "anulacao_total", valor: 4_000, data: "2026-07-22" }] }),
			empenho({ id: "y", dataEmpenho: "2026-07-01", events: [{ tipo: "cancelamento", valor: 1_000, data: "2026-07-22" }] }),
		])
		expect(result.comprometimento).toBe(-5_000)
	})

	test("a própria NE em edição fica de fora", () => {
		expect(commitmentForCreditLine(generos, SNAPSHOT, [empenho({ id: "self" })], { excludeEmpenhoId: "self" }).comprometimento).toBe(0)
	})
})

describe("pickCreditLineForEmpenho", () => {
	test("a competência mais recente e, nela, a linha mais específica", () => {
		const generic = { ...generos, id: "gen", ptres: null, fonte: null }
		const specific = { ...generos, id: "spec" }
		const older = { ...generos, id: "old", competencia: "2026-06-01" }
		const picked = pickCreditLineForEmpenho([older, generic, specific], empenho({}))
		expect(picked?.id).toBe("spec")
	})

	test("sem linha da classificação, nenhuma", () => {
		expect(pickCreditLineForEmpenho([generos], empenho({ nd: "449052" }))).toBeNull()
	})
})

describe("checkCreditForClassifiedEmpenho", () => {
	test("crédito insuficiente NA ND vira aviso com a norma, sem bloquear", () => {
		const others = [empenho({ id: "a", valorVigente: 35_000 }), empenho({ id: "b", nd: "33903922", valorVigente: 90_000 })]
		const check = checkCreditForClassifiedEmpenho(8_000, empenho({ id: "new" }), [generos], others, NOW)
		expect(check.status).toBe("insufficient")
		expect(check.excedente).toBe(3_000)
		expect(check.projection?.comprometimentoLocal).toBe(35_000)
		expect(check.message).toContain("ND 339030")
		expect(check.message).toContain("art. 59")
	})

	test("o empenho de outra ND não derruba o crédito desta", () => {
		const check = checkCreditForClassifiedEmpenho(8_000, empenho({ id: "new" }), [generos], [empenho({ id: "b", nd: "33903922", valorVigente: 90_000 })], NOW)
		expect(check.status).toBe("ok")
	})

	test("sem ND ou sem crédito importado: no_data", () => {
		expect(checkCreditForClassifiedEmpenho(1, empenho({ nd: null }), [generos], [], NOW).status).toBe("no_data")
		expect(checkCreditForClassifiedEmpenho(1, empenho({ nd: "449052" }), [generos], [], NOW).status).toBe("no_data")
	})
})

describe("sumCreditNotesForLine", () => {
	test("soma descentralizações e desconta anulações da classificação e do exercício", () => {
		const base = { ugFavorecida: "120070", nd: "339030", ptres: "170963", fonte: "1000" }
		const total = sumCreditNotesForLine(generos, [
			{ ...base, tipo: "descentralizacao", valor: 80_000, dataEmissao: "2026-02-10" },
			{ ...base, tipo: "descentralizacao", valor: 30_000, dataEmissao: "2026-05-10" },
			{ ...base, tipo: "anulacao", valor: 10_000, dataEmissao: "2026-06-01" },
			{ ...base, tipo: "descentralizacao", valor: 5_000, dataEmissao: "2025-11-01" },
			{ ...base, nd: "339039", tipo: "descentralizacao", valor: 7_000, dataEmissao: "2026-03-01" },
		])
		expect(total).toBe(100_000)
	})
})
