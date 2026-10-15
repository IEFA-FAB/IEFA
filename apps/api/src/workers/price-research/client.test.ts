import { afterEach, describe, expect, test } from "bun:test"
import { consultarMaterialPrecos } from "./client.ts"

/**
 * A pesquisa de preço roda dentro de um request atrás do ALB (60 s de idle). Sem prazo
 * global, três tentativas de 30 s numa página levavam 94 s e o ALB cortava antes do erro.
 */

const realFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = realFetch
})

function stubFetch(handler: (init?: RequestInit) => Promise<Response>) {
	let calls = 0
	globalThis.fetch = ((_input: unknown, init?: RequestInit) => {
		calls += 1
		return handler(init)
	}) as typeof fetch
	return () => calls
}

/** Fetch que só termina quando o sinal da tentativa aborta. */
function hangUntilAborted(init?: RequestInit): Promise<Response> {
	return new Promise((_resolve, reject) => {
		init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
	})
}

describe("consultarMaterialPrecos — prazo global", () => {
	test("API que não responde: falha dentro do prazo, sem tentativa nova sem folga", async () => {
		const calls = stubFetch(hangUntilAborted)
		const start = Date.now()

		await expect(consultarMaterialPrecos(123, {}, 1_500)).rejects.toThrow()

		expect(Date.now() - start).toBeLessThan(2_500)
		expect(calls()).toBe(1)
	})

	test("erro rápido é retentado só enquanto a espera cabe no prazo", async () => {
		const calls = stubFetch(async () => new Response("sobrecarga", { status: 503 }))

		// 1ª tentativa em t≈0; a 2ª espera 1 s e cabe em 2,5 s; a 3ª esperaria mais 3 s.
		await expect(consultarMaterialPrecos(123, {}, 2_500)).rejects.toThrow(/HTTP 503/)

		expect(calls()).toBe(2)
	})

	test("dentro do prazo, a resposta passa e o idCompra vira string", async () => {
		stubFetch(async () => new Response('{"resultado":[{"idCompra":12345678901234567}],"totalPaginas":1}'))

		const items = await consultarMaterialPrecos(123)

		expect(items).toEqual([{ idCompra: "12345678901234567" } as never])
	})
})
