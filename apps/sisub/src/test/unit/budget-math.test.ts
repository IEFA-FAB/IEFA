/**
 * Unit — crédito orçamentário: projeção (oficial × local × projetado) e
 * verificação antes de empenhar. Puro, sem DB.
 *
 * Invariante sob teste: saldo oficial (snapshot SIAFI) e comprometimento
 * local NUNCA são somados — o projetado é derivado e rotulado à parte.
 */
import { checkCreditForEmpenho, localCommitmentAfterSnapshot, projectBudget } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"

const SNAPSHOT = "2026-07-20T12:00:00.000Z"
const NOW = Date.parse("2026-07-25T12:00:00.000Z")

const snapshot = { dotacao: 500_000, empenhadoSiafi: 120_000, saldoSiafi: 380_000, snapshotAt: SNAPSHOT }

describe("localCommitmentAfterSnapshot", () => {
	test("soma apenas empenhos ativos posteriores ao snapshot", () => {
		const total = localCommitmentAfterSnapshot(
			[
				{ dataEmpenho: "2026-07-22T10:00:00.000Z", valor: 30_000, status: "ativo" },
				{ dataEmpenho: "2026-07-23T10:00:00.000Z", valor: 5_000, status: "ativo" },
			],
			SNAPSHOT
		)
		expect(total).toBe(35_000)
	})

	test("empenho ANTERIOR ao snapshot é ignorado (já está no empenhado oficial)", () => {
		const total = localCommitmentAfterSnapshot([{ dataEmpenho: "2026-07-10T10:00:00.000Z", valor: 99_000, status: "ativo" }], SNAPSHOT)
		expect(total).toBe(0)
	})

	test("empenho anulado não compromete", () => {
		const total = localCommitmentAfterSnapshot([{ dataEmpenho: "2026-07-22T10:00:00.000Z", valor: 30_000, status: "anulado" }], SNAPSHOT)
		expect(total).toBe(0)
	})

	test("lista vazia e snapshot inválido resultam em zero", () => {
		expect(localCommitmentAfterSnapshot([], SNAPSHOT)).toBe(0)
		expect(localCommitmentAfterSnapshot([{ dataEmpenho: "2026-07-22", valor: 10, status: "ativo" }], "não-é-data")).toBe(0)
	})
})

describe("projectBudget", () => {
	test("cenário do spec: oficial 380k, local 30k, projetado 350k — três grandezas distintas", () => {
		const projection = projectBudget(snapshot, [{ dataEmpenho: "2026-07-22T10:00:00.000Z", valor: 30_000, status: "ativo" }], NOW)
		expect(projection.saldoSiafi).toBe(380_000)
		expect(projection.comprometimentoLocal).toBe(30_000)
		expect(projection.saldoProjetado).toBe(350_000)
	})

	test("idade do snapshot é calculada em dias", () => {
		expect(projectBudget(snapshot, [], NOW).snapshotAgeDays).toBe(5)
	})

	test("snapshot com mais de 7 dias é marcado como stale", () => {
		const old = projectBudget({ ...snapshot, snapshotAt: "2026-07-01T12:00:00.000Z" }, [], NOW)
		expect(old.snapshotStale).toBe(true)
		expect(projectBudget(snapshot, [], NOW).snapshotStale).toBe(false)
	})

	test("comprometimento local pode deixar o projetado negativo (exibido como está)", () => {
		const projection = projectBudget(snapshot, [{ dataEmpenho: "2026-07-22T10:00:00.000Z", valor: 400_000, status: "ativo" }], NOW)
		expect(projection.saldoProjetado).toBe(-20_000)
	})
})

describe("checkCreditForEmpenho", () => {
	const projection = projectBudget(snapshot, [{ dataEmpenho: "2026-07-22T10:00:00.000Z", valor: 310_000, status: "ativo" }], NOW)

	test("valor dentro do projetado passa com mensagem informando a idade do dado", () => {
		const check = checkCreditForEmpenho(50_000, projection)
		expect(check.status).toBe("ok")
		expect(check.message).toMatch(/5 dia/)
	})

	test("valor acima do projetado alerta com o excedente — sem bloquear", () => {
		const check = checkCreditForEmpenho(80_000, projection)
		expect(check.status).toBe("insufficient")
		expect(check.excedente).toBe(10_000)
		expect(check.message).toMatch(/Confirme para prosseguir/)
	})

	test("sem crédito importado, informa e permite o registro", () => {
		const check = checkCreditForEmpenho(80_000, null)
		expect(check.status).toBe("no_data")
		expect(check.message).toMatch(/sem verificação de crédito/)
	})
})
