import { describe, expect, test } from "vitest"
import { listIgnoredInserts, normalizeCountQuantity, planCountEntryWrites } from "./count-entry-writes"

const USER = "user-1"
const entry = (clientEventId: string, quantity: number) => ({ clientEventId, quantity })

describe("planCountEntryWrites", () => {
	test("chave nova entra", () => {
		expect(planCountEntryWrites([entry("k1", 15)], [], USER)).toEqual({ inserts: [entry("k1", 15)], corrections: [] })
	})

	test("reenvio com o mesmo valor não grava nada (15 não vira 30)", () => {
		expect(planCountEntryWrites([entry("k1", 15)], [{ client_event_id: "k1", counted_by: USER, quantity: "15.0000" }], USER)).toEqual({
			inserts: [],
			corrections: [],
		})
	})

	test("valor corrigido com a chave pendente CORRIGE o lançamento gravado, em vez de somar ou ser descartado", () => {
		// A tentativa com 15 foi gravada e a resposta se perdeu; o operador corrigiu para 16.
		expect(planCountEntryWrites([entry("k1", 16)], [{ client_event_id: "k1", counted_by: USER, quantity: 15 }], USER)).toEqual({
			inserts: [],
			corrections: [entry("k1", 16)],
		})
	})

	test("chave de outra pessoa é recusada: corrigir mudaria o lançamento de outro autor", () => {
		expect(() => planCountEntryWrites([entry("k1", 16)], [{ client_event_id: "k1", counted_by: "user-2", quantity: 15 }], USER)).toThrow(
			/registrado por outra pessoa/
		)
	})

	test("lote misto da fila offline: cada chave no seu caminho", () => {
		const plan = planCountEntryWrites(
			[entry("k1", 15), entry("k2", 3), entry("k3", 7)],
			[
				{ client_event_id: "k1", counted_by: USER, quantity: 15 },
				{ client_event_id: "k2", counted_by: USER, quantity: 2 },
			],
			USER
		)
		expect(plan).toEqual({ inserts: [entry("k3", 7)], corrections: [entry("k2", 3)] })
	})

	test("quantidade com mais de 4 casas: o reenvio bate com o gravado em numeric(14,4) e não vira correção", () => {
		// 1.23456 gravou como 1.2346; sem normalizar, o reenvio era "correção" e mexia em counted_at
		expect(planCountEntryWrites([entry("k1", 1.23456)], [{ client_event_id: "k1", counted_by: USER, quantity: "1.2346" }], USER)).toEqual({
			inserts: [],
			corrections: [],
		})
		// diferença real na 4ª casa continua sendo correção
		expect(planCountEntryWrites([entry("k1", 1.2347)], [{ client_event_id: "k1", counted_by: USER, quantity: "1.2346" }], USER).corrections).toHaveLength(1)
	})
})

describe("normalizeCountQuantity", () => {
	test("arredonda a 4 casas, como o banco guarda", () => {
		expect(normalizeCountQuantity(1.23456)).toBe(1.2346)
		expect(normalizeCountQuantity("15.0000")).toBe(15)
		expect(normalizeCountQuantity(0)).toBe(0)
		expect(normalizeCountQuantity(0.1 + 0.2)).toBe(0.3)
	})
})

describe("listIgnoredInserts", () => {
	test("o upsert que ignora o conflito devolve só as inseridas; as outras são relidas", () => {
		// a tentativa original ainda gravava: a chave k2 apareceu entre a leitura e o upsert
		const inserts = [entry("k1", 15), entry("k2", 10)]
		expect(listIgnoredInserts(inserts, [{ client_event_id: "k1" }])).toEqual([entry("k2", 10)])
		expect(listIgnoredInserts(inserts, [{ client_event_id: "k1" }, { client_event_id: "k2" }])).toEqual([])
	})

	test("relida, a descartada do mesmo autor com outro valor vira correção, não sucesso calado", () => {
		const ignored = listIgnoredInserts([entry("k2", 10)], [])
		expect(planCountEntryWrites(ignored, [{ client_event_id: "k2", counted_by: USER, quantity: "15.0000" }], USER)).toEqual({
			inserts: [],
			corrections: [entry("k2", 10)],
		})
		expect(() => planCountEntryWrites(ignored, [{ client_event_id: "k2", counted_by: "user-2", quantity: 10 }], USER)).toThrow(/outra pessoa/)
	})
})
