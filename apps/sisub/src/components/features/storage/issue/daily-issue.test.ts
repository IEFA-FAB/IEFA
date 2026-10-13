import { describe, expect, test } from "vitest"
import { buildStockByIngredient, deriveIssueState, describeIssueHeader, isExtraWithoutStock, readUnexplainedDay } from "./daily-issue"

const line = (requiresReason: boolean, hasReason: boolean) => ({ requiresReason, hasReason })

describe("deriveIssueState", () => {
	test("sem requisição: fechada, sem pendência, dia de hoje e chaves nulas", () => {
		expect(deriveIssueState(null, "2026-10-13")).toEqual({ open: false, pending: [], issueDate: "2026-10-13", requestId: null, requestStatus: null })
	})

	test("requisição aberta: pendência é só desvio relevante sem motivo", () => {
		const pendingLine = line(true, false)
		const state = deriveIssueState(
			{ request: { id: "r1", status: "open", issue_date: "2026-10-10" }, lines: [line(false, false), pendingLine, line(true, true)] },
			"2026-10-13"
		)
		expect(state.open).toBe(true)
		expect(state.pending).toEqual([pendingLine])
		expect(state.issueDate).toBe("2026-10-10")
		expect(state.requestId).toBe("r1")
		expect(state.requestStatus).toBe("open")
	})

	test("requisição fechada não está aberta", () => {
		expect(deriveIssueState({ request: { id: "r1", status: "closed", issue_date: "2026-10-10" }, lines: [] }, "x").open).toBe(false)
	})
})

describe("buildStockByIngredient", () => {
	test("ignora linha sem insumo e desconta quarentena e vencido", () => {
		const map = buildStockByIngredient([
			{ ingredientId: null, description: "x", measureUnit: null, balance: 1, quarantinedBalance: 0, expiredBalance: 0 },
			{ ingredientId: "a", description: "Arroz", measureUnit: "KG", balance: 10, quarantinedBalance: 2, expiredBalance: 3 },
		])
		expect([...map.entries()]).toEqual([["a", { description: "Arroz", measureUnit: "KG", available: 5, gtins: [] }]])
	})
})

describe("isExtraWithoutStock", () => {
	const stock = buildStockByIngredient([
		{ ingredientId: "a", description: "A", measureUnit: null, balance: 1, quarantinedBalance: 0, expiredBalance: 0 },
		{ ingredientId: "z", description: "Z", measureUnit: null, balance: 1, quarantinedBalance: 1, expiredBalance: 0 },
	])
	test("nenhum insumo escolhido não avisa", () => {
		expect(isExtraWithoutStock(stock, "")).toBe(false)
	})
	test("com saldo não avisa; saldo zero ou ausente avisa", () => {
		expect(isExtraWithoutStock(stock, "a")).toBe(false)
		expect(isExtraWithoutStock(stock, "z")).toBe(true)
		expect(isExtraWithoutStock(stock, "desconhecido")).toBe(true)
	})
})

describe("describeIssueHeader", () => {
	test("produção", () => {
		expect(describeIssueHeader("production", { issue_date: "2026-10-13", purpose: "x" })).toEqual({
			title: "Saída do dia — 2026-10-13",
			description: "A produção sugere; você decide a quantidade. O motivo do desvio é pedido só no fechamento, e apenas onde ele é relevante.",
		})
	})
	test("avulsa, com e sem motivo", () => {
		expect(describeIssueHeader("ad_hoc", { issue_date: "2026-10-13", purpose: "Formatura" })).toEqual({
			title: "Saída avulsa — 2026-10-13",
			description: "Saída sem cardápio atrás: Formatura. Ela não entra na variância do dia.",
		})
		expect(describeIssueHeader("ad_hoc", { issue_date: "2026-10-13", purpose: null }).description).toBe(
			"Saída sem cardápio atrás: sem motivo registrado. Ela não entra na variância do dia."
		)
	})
})

describe("readUnexplainedDay", () => {
	test("campos ausentes viram nulo", () => {
		expect(readUnexplainedDay({})).toEqual({ autoClosedAt: null, explainedAt: null, explanation: null })
		expect(readUnexplainedDay({ auto_closed_at: "a", explained_at: "b", explanation: "c" })).toEqual({ autoClosedAt: "a", explainedAt: "b", explanation: "c" })
	})
})
