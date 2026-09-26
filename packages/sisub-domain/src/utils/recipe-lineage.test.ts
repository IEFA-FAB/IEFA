import { describe, expect, test } from "bun:test"
import { isLineageWinner, type LineageCandidate, pickLineageWinners } from "./recipe-lineage.ts"

const row = (id: string, version: number, opts: { base?: string; kitchen?: number } = {}): LineageCandidate => ({
	id,
	baseRecipeId: opts.base ?? null,
	kitchenId: opts.kitchen ?? null,
	version,
})

const ids = (rows: LineageCandidate[]) => rows.map((r) => r.id)

describe("isLineageWinner", () => {
	test("maior versão vence dentro do mesmo escopo", () => {
		expect(isLineageWinner(row("b", 2), row("a", 1))).toBe(true)
		expect(isLineageWinner(row("a", 1), row("b", 2))).toBe(false)
	})

	test("empate de versão no mesmo escopo não troca o vencedor", () => {
		expect(isLineageWinner(row("b", 3), row("a", 3))).toBe(false)
	})

	test("local vence global mesmo com versão menor, e global nunca derruba local", () => {
		expect(isLineageWinner(row("fork", 1, { kitchen: 7 }), row("global", 9))).toBe(true)
		expect(isLineageWinner(row("global", 9), row("fork", 1, { kitchen: 7 }))).toBe(false)
	})
})

describe("pickLineageWinners", () => {
	test("uma linha por linhagem, agrupando pela raiz", () => {
		const winners = pickLineageWinners([row("root", 1), row("v3", 3, { base: "root" }), row("v2", 2, { base: "root" }), row("solo", 1)])
		expect(ids(winners)).toEqual(["v3", "solo"])
	})

	test("independe da ordem de chegada das versões", () => {
		const lineage = [row("root", 1), row("v2", 2, { base: "root" }), row("v3", 3, { base: "root" })]
		for (const order of [lineage, lineage.toReversed(), [lineage[1], lineage[2], lineage[0]]]) {
			expect(ids(pickLineageWinners(order))).toEqual(["v3"])
		}
	})

	test("fork local sombreia o global da mesma linhagem", () => {
		const winners = pickLineageWinners([row("root", 1), row("v4", 4, { base: "root" }), row("fork", 2, { base: "root", kitchen: 7 })])
		expect(ids(winners)).toEqual(["fork"])
	})

	test("entre forks locais, maior versão", () => {
		const winners = pickLineageWinners([row("fork3", 3, { base: "root", kitchen: 7 }), row("root", 1), row("fork2", 2, { base: "root", kitchen: 7 })])
		expect(ids(winners)).toEqual(["fork3"])
	})

	test("empate exato fica com a primeira linha vista", () => {
		const winners = pickLineageWinners([row("a", 2, { base: "root" }), row("b", 2, { base: "root" })])
		expect(ids(winners)).toEqual(["a"])
	})

	test("versão órfã (raiz fora do recorte) ainda representa a família", () => {
		// Com `search`, a raiz pode não casar com o termo e só a versão nova vir.
		expect(ids(pickLineageWinners([row("v2", 2, { base: "root-fora" })]))).toEqual(["v2"])
	})

	test("ordem de saída segue a primeira aparição de cada raiz", () => {
		const winners = pickLineageWinners([row("x", 1), row("y", 1), row("x2", 2, { base: "x" })])
		expect(ids(winners)).toEqual(["x2", "y"])
	})

	test("lista vazia", () => {
		expect(pickLineageWinners([])).toEqual([])
	})
})
