/**
 * A regra das duas portas até o pagamento. Cada caso aqui é um defeito que já
 * foi encontrado em revisão — escrever o caso "recebimento divergente" teria
 * obrigado a lembrar que `divergent` existe.
 */
import { describe, expect, test } from "vitest"
import { invoiceSituationProblem, liquidationLinkProblems, SITUATION_MAX_AGE_DAYS } from "@/lib/invoice-gate"

const NOW = new Date("2026-09-18T12:00:00Z").getTime()
const RECENTE = new Date(NOW - 3600_000).toISOString()
const VELHA = new Date(NOW - (SITUATION_MAX_AGE_DAYS + 1) * 86_400_000).toISOString()

const autorizada = { status: "matched", situationResult: "authorized", situationCheckedAt: RECENTE }

describe("invoiceSituationProblem — a única autenticidade que a cadeia tem hoje", () => {
	test("autorizada e consultada há pouco libera", () => {
		expect(invoiceSituationProblem(autorizada, NOW)).toBeNull()
	})

	test("situação desconhecida NÃO libera", () => {
		// era o furo: `unknown` passava, e a cadeia ficava sem autenticidade nenhuma
		expect(invoiceSituationProblem({ ...autorizada, situationResult: "unknown" }, NOW)).toMatch(/AUTORIZADA/)
	})

	test("nunca consultada não libera", () => {
		expect(invoiceSituationProblem({ ...autorizada, situationResult: null, situationCheckedAt: null }, NOW)).toMatch(/Consulte/)
	})

	test("consulta velha não libera, mesmo autorizada", () => {
		// nota cancelada DEPOIS da efetivação não pode virar pagamento semanas depois
		expect(invoiceSituationProblem({ ...autorizada, situationCheckedAt: VELHA }, NOW)).toMatch(/vale 3 dias/)
	})

	test("cancelada não libera, por qualquer um dos dois campos", () => {
		expect(invoiceSituationProblem({ ...autorizada, status: "cancelled" }, NOW)).toMatch(/cancelada/)
		expect(invoiceSituationProblem({ ...autorizada, situationResult: "cancelled" }, NOW)).toMatch(/cancelada/)
	})
})

describe("liquidationLinkProblems — a segunda porta", () => {
	const recebimento = {
		unitId: 7,
		status: "definitive",
		definitiveAt: "2026-09-15T10:00:00Z",
		nfeDocumentId: "nfe-1",
		empenhoId: "emp-A",
		fiscalPending: false,
	}
	const base = { unitId: 7, empenhoId: "emp-A", receipt: recebimento, requestedNfeId: null, invoice: { ...autorizada, unitId: 7 } }

	test("vínculo certo passa", () => {
		expect(liquidationLinkProblems(base, NOW)).toEqual([])
	})

	test("recebimento DIVERGENTE efetivado continua liquidável", () => {
		// `finalize_goods_receipt` grava `divergent` com `definitive_at`: ler o status
		// em vez do instante recusava todos eles, e antes deste PR eles liquidavam
		expect(liquidationLinkProblems({ ...base, receipt: { ...recebimento, status: "divergent" } }, NOW)).toEqual([])
	})

	test("recebimento não efetivado não sustenta liquidação, qualquer que seja o status", () => {
		expect(liquidationLinkProblems({ ...base, receipt: { ...recebimento, status: "provisional", definitiveAt: null } }, NOW).join()).toMatch(/EFETIVADO/)
		// o status sozinho não atesta nada: sem o instante da efetivação, bloqueia
		expect(liquidationLinkProblems({ ...base, receipt: { ...recebimento, definitiveAt: null } }, NOW).join()).toMatch(/EFETIVADO/)
	})

	test("recebimento sem nota não aceita nota informada na liquidação", () => {
		const semNota = { ...recebimento, nfeDocumentId: null }
		expect(liquidationLinkProblems({ ...base, receipt: semNota, requestedNfeId: "nfe-9", invoice: { ...autorizada, unitId: 7 } }, NOW).join()).toMatch(
			/não tem NF-e vinculada/
		)
		// sem nota nenhuma, a entrega sem NF-e segue liquidável (o pão antes da nota não chega aqui: não há NS sem nota)
		expect(liquidationLinkProblems({ ...base, receipt: semNota, requestedNfeId: null, invoice: null }, NOW)).toEqual([])
	})

	test("nota sem unidade só passa quando vem pelo recebimento", () => {
		const semUnidade = { ...autorizada, unitId: null }
		expect(liquidationLinkProblems({ ...base, invoice: semUnidade }, NOW)).toEqual([])
		expect(liquidationLinkProblems({ unitId: 7, empenhoId: "emp-A", receipt: null, requestedNfeId: "nfe-9", invoice: semUnidade }, NOW).join()).toMatch(
			/não tem unidade atribuída/
		)
	})

	test("a mesma entrega não paga dois empenhos", () => {
		expect(liquidationLinkProblems({ ...base, empenhoId: "emp-B" }, NOW).join()).toMatch(/outro empenho/)
	})

	test("pendência fiscal aberta bloqueia", () => {
		expect(liquidationLinkProblems({ ...base, receipt: { ...recebimento, fiscalPending: true } }, NOW).join()).toMatch(/pendência fiscal/)
	})

	test("recebimento de outra unidade bloqueia", () => {
		expect(liquidationLinkProblems({ ...base, receipt: { ...recebimento, unitId: 9 } }, NOW).join()).toMatch(/não é desta unidade/)
	})

	test("NF-e informada diferente da do recebimento bloqueia", () => {
		expect(liquidationLinkProblems({ ...base, requestedNfeId: "nfe-2" }, NOW).join()).toMatch(/não é a do recebimento/)
	})

	test("a liquidação aplica a MESMA regra de idade da efetivação", () => {
		// uma cópia parcial da regra pulava a idade da consulta
		expect(liquidationLinkProblems({ ...base, invoice: { ...autorizada, unitId: 7, situationCheckedAt: VELHA } }, NOW).join()).toMatch(/vale 3 dias/)
	})

	test("liquidação sem recebimento e sem nota segue permitida", () => {
		// empenho que não é de gênero alimentício
		expect(liquidationLinkProblems({ unitId: 7, empenhoId: "emp-X", receipt: null, requestedNfeId: null, invoice: null }, NOW)).toEqual([])
	})
})
