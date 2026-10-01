/**
 * Contagem cega alcança toda leitura de saldo. Estas eram as três que escapavam: o painel de
 * vencimentos, o "vence no período" do planejamento e o disponível da baixa por produção.
 */
import { describe, expect, test } from "vitest"
import { maskBlindCountIssueLines, maskBlindCountQuantities, withoutBlindCountLots } from "@/lib/blind-count-mask"

const ARROZ = "ing-arroz"
const FEIJAO = "ing-feijao"
const PREP = "prep-1"
const HIDDEN = new Set([ARROZ, PREP])

describe("withoutBlindCountLots — painel de vencimentos", () => {
	const lots = [
		{ lotId: "l1", ingredientId: ARROZ, frozenPreparationId: null, balance: 10 },
		{ lotId: "l2", ingredientId: FEIJAO, frozenPreparationId: null, balance: 5 },
		{ lotId: "l3", ingredientId: null, frozenPreparationId: PREP, balance: 2 },
	]

	test("o lote do item em contagem sai, e a contagem de escondidos diz quantos", () => {
		const { visible, hiddenLots } = withoutBlindCountLots(lots, HIDDEN)
		expect(visible.map((lot) => lot.lotId)).toEqual(["l2"])
		expect(hiddenLots).toBe(2)
	})

	test("sem contagem aberta, nada muda", () => {
		expect(withoutBlindCountLots(lots, new Set())).toEqual({ visible: lots, hiddenLots: 0 })
	})
})

describe("maskBlindCountQuantities — vence no período", () => {
	test("o item em contagem fica, sem quantidade nem valor", () => {
		const items = [
			{ ingredientId: ARROZ, frozenPreparationId: null, quantity: 10, value: 50, firstExpiry: "2026-10-03" },
			{ ingredientId: FEIJAO, frozenPreparationId: null, quantity: 4, value: 20, firstExpiry: "2026-10-04" },
		]
		const masked = maskBlindCountQuantities(items, HIDDEN)
		expect(masked[0]).toMatchObject({ ingredientId: ARROZ, quantity: null, value: null, blindCount: true, firstExpiry: "2026-10-03" })
		expect(masked[1]).toMatchObject({ ingredientId: FEIJAO, quantity: 4, value: 20, blindCount: false })
	})
})

describe("maskBlindCountIssueLines — baixa por produção, para quem só lê", () => {
	test("a linha fica, sem disponível e sem o 'suficiente' (o mesmo número visto por um limiar)", () => {
		const lines = [
			{ ingredientId: ARROZ, quantity: 3, available: 10 as number | null, sufficient: true as boolean | null },
			{ ingredientId: FEIJAO, quantity: 3, available: 1 as number | null, sufficient: false as boolean | null },
		]
		const masked = maskBlindCountIssueLines(lines, HIDDEN)
		expect(masked[0]).toMatchObject({ available: null, sufficient: null, blindCount: true, quantity: 3 })
		expect(masked[1]).toMatchObject({ available: 1, sufficient: false, blindCount: false })
	})
})
