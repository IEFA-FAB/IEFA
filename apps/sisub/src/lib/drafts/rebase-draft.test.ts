import { describe, expect, it } from "vitest"
import { rebaseDraftValues } from "./rebase-draft"

type Row = { id: string; qty: number }
type Values = { name: string; factor: number; method: string; rows: Row[] }

const opened: Values = {
	name: "Arroz",
	factor: 1,
	method: "cozinhar",
	rows: [
		{ id: "a", qty: 1 },
		{ id: "b", qty: 2 },
	],
}
const lists = { rows: (row: Row) => row.id }

describe("rebaseDraftValues", () => {
	it("leva só o que o usuário mudou e mantém o que a outra pessoa gravou", () => {
		const edited = { ...opened, method: "refogar e cozinhar" }
		const head = { ...opened, factor: 2.7 }
		const result = rebaseDraftValues(opened, edited, head, lists)
		expect(result.values).toEqual({ ...opened, factor: 2.7, method: "refogar e cozinhar" })
		expect(result.carried).toEqual(["method"])
		expect(result.overlapping).toEqual([])
	})

	it("campo mudado pelos dois lados para valores diferentes: vale o do usuário e é sinalizado", () => {
		const edited = { ...opened, factor: 1.08 }
		const head = { ...opened, factor: 2.7 }
		const result = rebaseDraftValues(opened, edited, head, lists)
		expect(result.values.factor).toBe(1.08)
		expect(result.overlapping).toEqual(["factor"])
	})

	it("os dois lados chegaram ao mesmo valor: nada a sinalizar", () => {
		const edited = { ...opened, factor: 2.7 }
		const head = { ...opened, factor: 2.7 }
		expect(rebaseDraftValues(opened, edited, head, lists).overlapping).toEqual([])
	})

	it("lista: mescla por item — inclusão, remoção e alteração do usuário sobre a lista vigente", () => {
		const edited = {
			...opened,
			rows: [
				{ id: "a", qty: 5 },
				{ id: "c", qty: 3 },
			],
		} // alterou a, tirou b, incluiu c
		const head = {
			...opened,
			rows: [
				{ id: "a", qty: 1 },
				{ id: "b", qty: 2 },
				{ id: "d", qty: 4 },
			],
		} // outra pessoa incluiu d
		const result = rebaseDraftValues(opened, edited, head, lists)
		expect(result.values.rows).toEqual([
			{ id: "a", qty: 5 },
			{ id: "d", qty: 4 },
			{ id: "c", qty: 3 },
		])
		expect(result.carried).toEqual(["rows"])
		expect(result.overlapping).toEqual([])
	})

	it("lista: item alterado pelos dois lados, ou tirado pela vigente, é sinalizado", () => {
		const edited = {
			...opened,
			rows: [
				{ id: "a", qty: 5 },
				{ id: "b", qty: 9 },
			],
		}
		const head = { ...opened, rows: [{ id: "a", qty: 7 }] } // outra pessoa mudou a e tirou b
		const result = rebaseDraftValues(opened, edited, head, lists)
		expect(result.values.rows).toEqual([
			{ id: "a", qty: 5 },
			{ id: "b", qty: 9 },
		])
		expect(result.overlapping).toEqual(["rows:a", "rows:b"])
	})

	it("sem alteração do usuário, o resultado é a vigente", () => {
		const head = { ...opened, factor: 2.7 }
		const result = rebaseDraftValues(opened, { ...opened }, head, lists)
		expect(result.values).toEqual(head)
		expect(result.carried).toEqual([])
	})
})
