import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { checkSupplierSicaf } from "./sicaf.server"

const CNPJ = "00000000000191"

type Route = { status: number; body: unknown }

/**
 * Roteia por `ativo` porque é o parâmetro que estava FALTANDO — a asserção
 * central destes testes é que ele vai na query. Sem ele a API real responde 404
 * (`{"statusCode":404,"message":"Resource not found"}`), e não 200 com lista
 * vazia: era assim que o gate de SICAF na emissão de OF respondia
 * `indeterminado` em 100% das chamadas.
 */
function mockCompras(routes: { ativo?: Route; inativo?: Route; semAtivo?: Route }) {
	const calls: URL[] = []
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: Request | string) => {
			const url = new URL(typeof input === "string" ? input : input.url)
			calls.push(url)
			const ativo = url.searchParams.get("ativo")
			const route = ativo === null ? routes.semAtivo : ativo === "true" ? routes.ativo : routes.inativo
			if (!route) return new Response(JSON.stringify({ statusCode: 404, message: "Resource not found" }), { status: 404 })
			return new Response(JSON.stringify(route.body), { status: route.status, headers: { "content-type": "application/json" } })
		})
	)
	return calls
}

const page = (rows: unknown[]) => ({ resultado: rows, totalRegistros: rows.length, totalPaginas: 1, paginasRestantes: 0 })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

describe("checkSupplierSicaf", () => {
	test("manda o obrigatório ativo na query", async () => {
		const calls = mockCompras({ ativo: { status: 200, body: page([{ ativo: true, habilitadoLicitar: true }]) } })
		await checkSupplierSicaf(CNPJ)

		expect(calls).toHaveLength(1)
		expect(calls[0].pathname).toBe("/modulo-fornecedor/1_consultarFornecedor")
		expect(calls[0].searchParams.get("ativo")).toBe("true")
		expect(calls[0].searchParams.get("cnpj")).toBe(CNPJ)
	})

	test("ativo e habilitado a licitar = regular", async () => {
		mockCompras({ ativo: { status: 200, body: page([{ ativo: true, habilitadoLicitar: true }]) } })
		await expect(checkSupplierSicaf(CNPJ)).resolves.toEqual({
			status: "regular",
			detail: "Ativo e habilitado a licitar no SICAF",
		})
	})

	// Estar cadastrado e ativo não implica poder licitar — é a distinção que
	// interessa na emissão de OF, e o código antigo não a enxergava.
	test("ativo mas NÃO habilitado a licitar = irregular", async () => {
		mockCompras({ ativo: { status: 200, body: page([{ ativo: true, habilitadoLicitar: false }]) } })
		await expect(checkSupplierSicaf(CNPJ)).resolves.toEqual({
			status: "irregular",
			detail: "Ativo no SICAF, porém NÃO habilitado a licitar",
		})
	})

	// `ativo=true` também FILTRA, então quem não aparece ali pode ser inativo ou
	// inexistente. A segunda consulta é o que separa os dois.
	test("ausente entre os ativos e presente entre os inativos = irregular", async () => {
		const calls = mockCompras({
			ativo: { status: 200, body: page([]) },
			inativo: { status: 200, body: page([{ ativo: false, habilitadoLicitar: false }]) },
		})
		await expect(checkSupplierSicaf(CNPJ)).resolves.toEqual({
			status: "irregular",
			detail: "Cadastro inativo no SICAF",
		})
		expect(calls.map((c) => c.searchParams.get("ativo"))).toEqual(["true", "false"])
	})

	test("ausente nas duas consultas = nao_encontrado", async () => {
		mockCompras({ ativo: { status: 200, body: page([]) }, inativo: { status: 200, body: page([]) } })
		await expect(checkSupplierSicaf(CNPJ)).resolves.toEqual({
			status: "nao_encontrado",
			detail: "Fornecedor não localizado no SICAF",
		})
	})

	test("falha da API não bloqueia a emissão — vira indeterminado", async () => {
		mockCompras({ ativo: { status: 500, body: { message: "boom" } } })
		const promise = checkSupplierSicaf(CNPJ)
		await vi.runAllTimersAsync()
		await expect(promise).resolves.toEqual({
			status: "indeterminado",
			detail: "API SICAF indisponível — decisão manual com registro",
		})
	})
})
