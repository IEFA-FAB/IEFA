import { afterEach, describe, expect, test } from "bun:test"
import { fetchPcaCsv, PncpUnavailableError } from "./client.ts"

/** Backoffs curtos: o teste exercita a lógica de retentativa, não a espera real. */
const FAST = { retryDelaysMs: [1, 1, 1] } as const

/**
 * Os três corpos que a origem devolveu na medição e que quebrariam um cliente que
 * desserializasse antes de checar o status:
 *
 *   429 → corpo HTML
 *   500 → `content-type: application/json` com corpo de TEXTO puro
 *   204 → corpo vazio  (foi a resposta da UASG 120133 / DIRAD)
 */

const realFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = realFetch
})

function stubFetch(responses: Array<() => Response>) {
	let i = 0
	const calls = { count: 0, headers: [] as Array<Record<string, string>> }
	globalThis.fetch = ((_url: string, init?: RequestInit) => {
		calls.count++
		calls.headers.push(Object.fromEntries(new Headers(init?.headers).entries()))
		const make = responses[Math.min(i++, responses.length - 1)]
		return Promise.resolve(make())
	}) as typeof fetch
	return calls
}

const ok = (body: string) => () => new Response(body, { status: 200 })
const noContent = () => new Response(null, { status: 204 })
const html429 = () => new Response("<html><body>Limite de requisições excedido</body></html>", { status: 429, headers: { "content-type": "text/html" } })
const text500 = () =>
	new Response('"Erro na comunicação com o banco de dados."', {
		status: 500,
		headers: { "content-type": "application/json" },
	})

describe("fetchPcaCsv", () => {
	test("200 devolve o conteúdo e o tamanho", async () => {
		stubFetch([ok("UASG;Id\n120623;1")])

		const r = await fetchPcaCsv("00394429000100", 2026, FAST)

		expect(r.content).toContain("120623")
		expect(r.byteSize).toBeGreaterThan(0)
	})

	test("204 é ausência de plano, não erro — e NÃO tenta desserializar", async () => {
		stubFetch([noContent])

		const r = await fetchPcaCsv("00394429000100", 2030, FAST)

		expect(r.content).toBeNull()
		expect(r.byteSize).toBe(0)
	})

	test("429 com corpo HTML é retentável e vira erro tipado, não erro de parse", async () => {
		stubFetch([html429])

		const err = await fetchPcaCsv("00394429000100", 2026, FAST).catch((e) => e)

		expect(err).toBeInstanceOf(PncpUnavailableError)
		expect((err as PncpUnavailableError).status).toBe(429)
	})

	test("500 com content-type JSON e corpo de texto é retentável", async () => {
		stubFetch([text500])

		const err = await fetchPcaCsv("00394429000100", 2026, FAST).catch((e) => e)

		expect(err).toBeInstanceOf(PncpUnavailableError)
		expect((err as PncpUnavailableError).status).toBe(500)
		expect((err as Error).message).toContain("banco de dados")
	})

	test("erro transitório é retentado e a coleta se recupera", async () => {
		const calls = stubFetch([text500, ok("UASG;Id\n120623;1")])

		const r = await fetchPcaCsv("00394429000100", 2026, FAST)

		expect(r.content).toContain("120623")
		expect(calls.count).toBe(2)
	})

	test("404 não é retentado — não adianta insistir em órgão inexistente", async () => {
		const calls = stubFetch([() => new Response("not found", { status: 404 })])

		await expect(fetchPcaCsv("00000000000000", 2026, FAST)).rejects.toThrow(PncpUnavailableError)
		expect(calls.count).toBe(1)
	})

	test("não envia autenticação nem pede compressão — a API é aberta e ignora gzip", async () => {
		const calls = stubFetch([ok("UASG;Id\n1;1")])

		await fetchPcaCsv("00394429000100", 2026, FAST)

		const sent = calls.headers[0]
		expect(sent.authorization).toBeUndefined()
		expect(sent["accept-encoding"]).toBeUndefined()
	})
})
