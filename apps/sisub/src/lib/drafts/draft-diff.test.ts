import { describe, expect, it } from "vitest"
import { computeDraftChanges, hasSameShape, isDraftValueEqual } from "./draft-diff"

describe("isDraftValueEqual", () => {
	it("trata vazio, nulo e ausente como o mesmo valor", () => {
		expect(isDraftValueEqual("", null)).toBe(true)
		expect(isDraftValueEqual(undefined, "")).toBe(true)
		expect(isDraftValueEqual(0, null)).toBe(false)
	})

	it("compara objetos e listas pela estrutura", () => {
		expect(isDraftValueEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true)
		expect(isDraftValueEqual({ a: 1 }, { a: 1, b: "" })).toBe(true)
		expect(isDraftValueEqual([1, 2], [2, 1])).toBe(false)
	})
})

describe("computeDraftChanges", () => {
	const baseline = { description: "Arroz", price: 10, unit: "", notes: null as string | null }

	it("lista só o que mudou, na ordem das especificações, com rótulo e valores formatados", () => {
		const changes = computeDraftChanges(
			baseline,
			{ ...baseline, price: 12.5, description: "Arroz tipo 1" },
			{ price: { label: "Preço" }, description: { label: "Descrição" } }
		)
		expect(changes).toEqual([
			{ key: "price", label: "Preço", from: "10", to: "12,5" },
			{ key: "description", label: "Descrição", from: "Arroz", to: "Arroz tipo 1" },
		])
	})

	it("não esconde campo sem especificação", () => {
		const changes = computeDraftChanges(baseline, { ...baseline, notes: "novo" }, { description: { label: "Descrição" } })
		expect(changes).toEqual([{ key: "notes", label: "notes", from: "—", to: "novo" }])
	})

	it("limpar um campo vazio não é alteração", () => {
		expect(computeDraftChanges(baseline, { ...baseline, unit: null as unknown as string })).toEqual([])
	})

	it("expande campo composto em várias alterações", () => {
		const baseline: { nutrients: Record<string, string> } = { nutrients: { kcal: "100", prot: "2" } }
		const changes = computeDraftChanges(
			baseline,
			{ nutrients: { kcal: "120", prot: "2" } },
			{
				nutrients: {
					label: "Nutrientes",
					expand: (from, to) =>
						Object.keys(to)
							.filter((k) => from[k] !== to[k])
							.map((k) => ({ key: `nutrients:${k}`, label: k, from: from[k] ?? "—", to: to[k] ?? "—" })),
				},
			}
		)
		expect(changes).toEqual([{ key: "nutrients:kcal", label: "kcal", from: "100", to: "120" }])
	})
})

describe("computeDraftChanges com igualdade própria", () => {
	it("compara pelo critério do campo", () => {
		const ref = (id: string, extra?: string) => ({ id, extra })
		const fields = { reference: { label: "Tabela", isEqual: (a: { id: string }, b: { id: string }) => a.id === b.id, format: (v: { id: string }) => v.id } }
		expect(computeDraftChanges({ reference: ref("a") }, { reference: ref("a", "x") }, fields)).toEqual([])
		expect(computeDraftChanges({ reference: ref("a") }, { reference: ref("b") }, fields)).toEqual([{ key: "reference", label: "Tabela", from: "a", to: "b" }])
	})
})

describe("hasSameShape", () => {
	it("aceita o rascunho com as mesmas chaves e recusa o de outra forma", () => {
		expect(hasSameShape({ b: 1, a: 2 }, { a: 0, b: 0 })).toBe(true)
		expect(hasSameShape({ a: 1 }, { a: 0, novo: 0 })).toBe(false)
		expect(hasSameShape({ a: 1, velho: 0 }, { a: 0 })).toBe(false)
		expect(hasSameShape(undefined, { a: 0 })).toBe(false)
		expect(hasSameShape([1], { 0: 0 })).toBe(false)
	})
})
