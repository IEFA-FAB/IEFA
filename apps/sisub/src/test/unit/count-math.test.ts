/**
 * Matemática do inventário.
 *
 * O que estes testes seguram é o que separa um inventário de uma planilha:
 * o instante da contagem vale mais que o de agora, o relógio do tablet não é
 * confiável, e divergência relevante precisa das DUAS tolerâncias.
 */
import { evaluateCountLine, lineQuantity, movedDuringSync, resolveCountedAt, unlottedReference } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"

describe("resolveCountedAt", () => {
	const window = { skewMs: 0, lastSyncAt: "2026-09-18T08:00:00.000Z", receivedAt: "2026-09-18T10:30:00.000Z" }

	test("corrige o relógio do dispositivo pelo desvio medido", () => {
		// tablet 5 min atrasado: o desvio é positivo e empurra a leitura para frente
		const resolved = resolveCountedAt("2026-09-18T08:55:00.000Z", { ...window, skewMs: 5 * 60_000 })
		expect(resolved.countedAt).toBe("2026-09-18T09:00:00.000Z")
		expect(resolved.outsideWindow).toBe(false)
	})

	test("relógio muito adiantado é preso no recebimento, e a linha fica marcada", () => {
		// sem o teto, um tablet com a data errada colocaria a contagem no futuro e
		// a diferença seria apurada contra um saldo que ainda não existe
		const resolved = resolveCountedAt("2026-09-20T09:00:00.000Z", window)
		expect(resolved.countedAt).toBe(window.receivedAt)
		expect(resolved.outsideWindow).toBe(true)
	})

	test("relógio muito atrasado é preso na última sincronização", () => {
		const resolved = resolveCountedAt("2026-09-10T09:00:00.000Z", window)
		expect(resolved.countedAt).toBe(window.lastSyncAt)
		expect(resolved.outsideWindow).toBe(true)
	})
})

describe("movedDuringSync", () => {
	test("movimento entre a contagem e o recebimento manda para recontagem", () => {
		// o cenário da spec: conta 50 às 09:00 sem sinal, saem 10 às 10:00, a
		// folha sincroniza às 10:30
		expect(movedDuringSync(["2026-09-18T10:00:00.000Z"], "2026-09-18T09:00:00.000Z", "2026-09-18T10:30:00.000Z")).toBe(true)
	})

	test("movimento anterior à contagem não conta", () => {
		expect(movedDuringSync(["2026-09-18T08:00:00.000Z"], "2026-09-18T09:00:00.000Z", "2026-09-18T10:30:00.000Z")).toBe(false)
	})

	test("movimento posterior ao recebimento não conta", () => {
		// depois do recebimento o saldo já é problema do ledger, não da contagem
		expect(movedDuringSync(["2026-09-18T11:00:00.000Z"], "2026-09-18T09:00:00.000Z", "2026-09-18T10:30:00.000Z")).toBe(false)
	})
})

describe("lineQuantity", () => {
	test("duas pessoas na mesma câmara somam", () => {
		expect(
			lineQuantity([
				{ quantity: 12, countedAt: "2026-09-18T09:00:00.000Z" },
				{ quantity: 8, countedAt: "2026-09-18T09:05:00.000Z" },
			])
		).toBe(20)
	})

	test("sobrescrita anula o que veio antes dela, e soma o que veio depois", () => {
		expect(
			lineQuantity([
				{ quantity: 12, countedAt: "2026-09-18T09:00:00.000Z" },
				{ quantity: 8, countedAt: "2026-09-18T09:05:00.000Z" },
				{ quantity: 30, countedAt: "2026-09-18T09:10:00.000Z", overwrite: true },
				{ quantity: 5, countedAt: "2026-09-18T09:15:00.000Z" },
			])
		).toBe(35)
	})

	test("sem lançamento, zero", () => {
		expect(lineQuantity([])).toBe(0)
	})
})

describe("evaluateCountLine", () => {
	const tolerance = { percent: 5, floorValue: 50 }

	test("precisa passar das DUAS tolerâncias para ir a recontagem", () => {
		// 40% de um saquinho de fermento: muito em percentual, R$ 4 em dinheiro
		const fermento = evaluateCountLine({ counted: 6, ledger: 10, unitCost: 1 }, tolerance)
		expect(fermento.percent).toBe(40)
		expect(fermento.needsRecount).toBe(false)

		// 2% de um contêiner de carne: pouco em percentual, R$ 600 em dinheiro
		const carne = evaluateCountLine({ counted: 980, ledger: 1000, unitCost: 30 }, tolerance)
		expect(carne.differenceValue).toBe(600)
		expect(carne.needsRecount).toBe(false)

		// 30% de óleo, R$ 240: passa nas duas
		const oleo = evaluateCountLine({ counted: 30, ledger: 60, unitCost: 8 }, tolerance)
		expect(oleo.needsRecount).toBe(true)
	})

	test("achado: item com saldo zero e contagem positiva é 100% de divergência, não divisão por zero", () => {
		const achado = evaluateCountLine({ counted: 12, ledger: 0, unitCost: 10 }, tolerance)
		expect(achado.percent).toBe(100)
		expect(achado.differenceValue).toBe(120)
		expect(achado.needsRecount).toBe(true)
	})

	test("contado igual ao ledger não é divergência nem com saldo zero", () => {
		expect(evaluateCountLine({ counted: 0, ledger: 0, unitCost: 10 }, tolerance).percent).toBe(0)
		expect(evaluateCountLine({ counted: 0, ledger: 0, unitCost: 10 }, tolerance).needsRecount).toBe(false)
	})
})

describe("unlottedReference", () => {
	test("a linha sem lote é comparada com os lotes que ninguém contou", () => {
		// cenário da spec: arroz com L1 (10) e L2 (5), L1 contado, lançado
		// "arroz sem lote 5" — não pode gerar sobra de 5 nem falta de 5
		const referencia = unlottedReference(
			0,
			[
				{ lotId: "L1", balance: 10 },
				{ lotId: "L2", balance: 5 },
			],
			["L1"]
		)
		expect(referencia).toBe(5)
		expect(evaluateCountLine({ counted: 5, ledger: referencia, unitCost: 4 }, { percent: 5, floorValue: 50 }).difference).toBe(0)
	})

	test("com todos os lotes contados, sobra só o saldo sem lote", () => {
		expect(unlottedReference(3, [{ lotId: "L1", balance: 10 }], ["L1"])).toBe(3)
	})
})
