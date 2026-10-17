import { describe, expect, test } from "vitest"
import { planCountEntryWrites } from "./count-entry-writes"

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
})
