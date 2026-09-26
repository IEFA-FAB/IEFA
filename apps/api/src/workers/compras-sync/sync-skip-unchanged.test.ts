import { beforeEach, describe, expect, mock, test } from "bun:test"
import { type FakeColumnType, FakePostgrest } from "./fake-postgrest.test-support.ts"

/**
 * Prova de equivalência dos steps reais do sync contra um PostgREST em memória: com o diff, o
 * estado de negócio das tabelas é o mesmo que o upsert cego produziria, mas a segunda execução com
 * a API igual não grava nada, e a terceira grava só o que mudou.
 */

type Page = { resultado: Record<string, unknown>[]; totalRegistros: number; totalPaginas: number; paginasRestantes: number }
const apiPages = new Map<string, Record<string, unknown>[][]>()

function toPage(resultado: Record<string, unknown>[], total: number): Page {
	return { resultado, totalRegistros: resultado.length, totalPaginas: total, paginasRestantes: 0 }
}

// Só os steps do compras-sync importam este client; o mock declara todos os exports do módulo real.
mock.module("./client.ts", () => ({
	comprasRequest: (endpoint: string, params: Record<string, unknown> = {}) => ({ endpoint, params }),
	fetchPage: async () => {
		throw new Error("fetchPage não é usado nos testes")
	},
	fetchAllPages: async function* (request: { endpoint: string }) {
		const pages = apiPages.get(request.endpoint) ?? []
		for (const [index, resultado] of pages.entries()) yield { page: toPage(resultado, pages.length), pageNumber: index + 1 }
	},
	calcConcurrency: () => 2,
	fetchAllPagesParallel: async (request: { endpoint: string }, _concurrency: number, onPage: (page: Page, pageNumber: number) => Promise<void>) => {
		const pages = apiPages.get(request.endpoint) ?? []
		await Promise.all(pages.map((resultado, index) => onPage(toPage(resultado, pages.length), index + 1)))
	},
}))

const { syncMaterialCaracteristica, syncMaterialItem, syncMaterialUnidadeFornecimento } = await import("./material.ts")
const { syncServicoItem, syncServicoUnidadeMedida } = await import("./servico.ts")

const noProgress = async () => {}

const CARACTERISTICA_COLUMNS: Record<string, FakeColumnType> = {
	codigo_item: "integer",
	codigo_caracteristica: "text",
	nome_caracteristica: "text",
	status_caracteristica: "boolean",
	codigo_valor_caracteristica: "text",
	nome_valor_caracteristica: "text",
	status_valor_caracteristica: "boolean",
	numero_caracteristica: "integer",
	sigla_unidade_medida: "text",
	data_hora_atualizacao: "timestamptz",
}

function newDb(): FakePostgrest {
	return new FakePostgrest()
		.define("compras_material_caracteristica", ["codigo_item", "codigo_caracteristica", "codigo_valor_caracteristica"], CARACTERISTICA_COLUMNS)
		.define("compras_material_item", ["codigo_item"], {
			codigo_item: "integer",
			codigo_pdm: "integer",
			descricao_item: "text",
			status_item: "boolean",
			item_sustentavel: "boolean",
			codigo_ncm: "text",
			descricao_ncm: "text",
			aplica_margem_preferencia: "boolean",
			data_hora_atualizacao: "timestamptz",
		})
		.define("compras_material_unidade_fornecimento", ["codigo_pdm", "numero_sequencial_unidade_fornecimento"], {
			codigo_pdm: "integer",
			numero_sequencial_unidade_fornecimento: "integer",
			sigla_unidade_fornecimento: "text",
			nome_unidade_fornecimento: "text",
			descricao_unidade_fornecimento: "text",
			sigla_unidade_medida: "text",
			capacidade_unidade_fornecimento: "numeric",
			status_unidade_fornecimento_pdm: "boolean",
			data_hora_atualizacao: "timestamptz",
		})
		.define("compras_servico_item", ["codigo_servico"], {
			codigo_servico: "integer",
			codigo_subclasse: "integer",
			nome_servico: "text",
			codigo_cpc: "integer",
			exclusivo_central_compras: "boolean",
			status_servico: "boolean",
			data_hora_atualizacao: "timestamptz",
		})
		.define("compras_servico_unidade_medida", ["codigo_servico", "sigla_unidade_medida"], {
			codigo_servico: "integer",
			sigla_unidade_medida: "text",
			nome_unidade_medida: "text",
			status_unidade_medida: "boolean",
		})
}

// O client do Supabase é genérico demais para o fake; ele cobre só o que o sync usa.
const asClient = (db: FakePostgrest) => db as any

function caracteristicaApi(codigoItem: number, codigoCaracteristica: string, codigoValor: string | null, overrides: Record<string, unknown> = {}) {
	return {
		codigoItem,
		codigoCaracteristica,
		nomeCaracteristica: `CARAC ${codigoCaracteristica}`,
		statusCaracteristica: true,
		codigoValorCaracteristica: codigoValor,
		nomeValorCaracteristica: codigoValor ? `VALOR ${codigoValor}` : null,
		statusValorCaracteristica: codigoValor ? true : null,
		numeroCaracteristica: 1,
		siglaUnidadeMedida: null,
		// Zeros finais: o banco devolve `.1+00:00`, o diff precisa ver como igual.
		dataHoraAtualizacao: "2024-05-14T03:00:00.100000",
		...overrides,
	}
}

const CARACTERISTICA_ENDPOINT = "/modulo-material/7_consultarMaterialCaracteristicas"

function caracteristicaPages(): Record<string, unknown>[][] {
	return [
		[caracteristicaApi(1, "10", "100"), caracteristicaApi(1, "11", "110"), caracteristicaApi(1, "12", null), caracteristicaApi(2, "10", "101")],
		[caracteristicaApi(3, "10", "102"), caracteristicaApi(3, "13", null), caracteristicaApi(4, "10", "100")],
	]
}

describe("syncMaterialCaracteristica sem regravação", () => {
	let db: FakePostgrest
	beforeEach(() => {
		db = newDb()
	})

	test("1ª execução insere tudo; 2ª com a API igual não grava nada nem mexe em synced_at", async () => {
		apiPages.set(CARACTERISTICA_ENDPOINT, caracteristicaPages())

		expect(await syncMaterialCaracteristica(asClient(db), noProgress)).toBe(7)
		expect(db.inserted).toBe(7)
		const afterFirst = structuredClone(db.rows("compras_material_caracteristica"))

		db.resetCounters()
		expect(await syncMaterialCaracteristica(asClient(db), noProgress)).toBe(0)
		expect(db.upserts).toEqual([])
		expect({ inserted: db.inserted, updated: db.updated }).toEqual({ inserted: 0, updated: 0 })
		// Linha intacta, inclusive synced_at: nenhuma tupla nova.
		expect(db.rows("compras_material_caracteristica")).toEqual(afterFirst)
		// Uma leitura por página da API, pela chave-pai (prefixo do unique).
		expect(db.selects.map((s) => [s.table, s.lookupColumn, s.lookupCount])).toEqual([
			["compras_material_caracteristica", "codigo_item", 2],
			["compras_material_caracteristica", "codigo_item", 2],
		])
	})

	test("3ª execução grava só as linhas alteradas e novas; o estado final é o do upsert cego", async () => {
		apiPages.set(CARACTERISTICA_ENDPOINT, caracteristicaPages())
		await syncMaterialCaracteristica(asClient(db), noProgress)

		const changedPages = caracteristicaPages()
		changedPages[0][1] = caracteristicaApi(1, "11", "110", { nomeValorCaracteristica: "VALOR NOVO" })
		changedPages[1][2] = caracteristicaApi(4, "10", "100", { statusCaracteristica: false, dataHoraAtualizacao: "2026-09-01T12:00:00" })
		changedPages[1].push(caracteristicaApi(4, "14", "140"))
		apiPages.set(CARACTERISTICA_ENDPOINT, changedPages)

		db.resetCounters()
		expect(await syncMaterialCaracteristica(asClient(db), noProgress)).toBe(3)
		expect({ inserted: db.inserted, updated: db.updated }).toEqual({ inserted: 1, updated: 2 })
		expect(db.upserts.map((u) => u.rows)).toEqual([1, 2])

		// Referência: banco novo recebendo só a versão atual da API = o que o upsert cego deixaria.
		const reference = newDb()
		await syncMaterialCaracteristica(asClient(reference), noProgress)
		expect(db.businessState("compras_material_caracteristica")).toEqual(reference.businessState("compras_material_caracteristica"))
	})

	test("chave com codigo_valor NULL deixa de ser duplicada a cada execução", async () => {
		// O unique (codigo_item, codigo_caracteristica, codigo_valor_caracteristica) não iguala NULLs:
		// o upsert cego inseria uma cópia nova a cada sync. Com o diff, cópia igual existente = pula.
		apiPages.set(CARACTERISTICA_ENDPOINT, caracteristicaPages())
		await syncMaterialCaracteristica(asClient(db), noProgress)
		await syncMaterialCaracteristica(asClient(db), noProgress)
		await syncMaterialCaracteristica(asClient(db), noProgress)
		expect(db.rows("compras_material_caracteristica").filter((row) => row.codigo_valor_caracteristica === null)).toHaveLength(2)
	})

	test("leitura prévia falhando grava o lote inteiro, como antes", async () => {
		apiPages.set(CARACTERISTICA_ENDPOINT, caracteristicaPages())
		await syncMaterialCaracteristica(asClient(db), noProgress)
		db.resetCounters()
		db.failSelects = true
		expect(await syncMaterialCaracteristica(asClient(db), noProgress)).toBe(7)
		expect(db.upserts.map((u) => u.rows)).toEqual([4, 3])
	})

	test("max_rows menor que a página de leitura só custa gravação a mais, nunca pula mudança", async () => {
		apiPages.set(CARACTERISTICA_ENDPOINT, caracteristicaPages())
		await syncMaterialCaracteristica(asClient(db), noProgress)
		const changedPages = caracteristicaPages()
		changedPages[0][3] = caracteristicaApi(2, "10", "101", { nomeCaracteristica: "MUDOU" })
		apiPages.set(CARACTERISTICA_ENDPOINT, changedPages)

		db.maxRows = 1
		await syncMaterialCaracteristica(asClient(db), noProgress)
		expect(db.rows("compras_material_caracteristica").find((row) => row.codigo_item === 2)?.nome_caracteristica).toBe("MUDOU")
	})
})

describe("syncMaterialItem sem regravação", () => {
	const ITEM_ENDPOINT = "/modulo-material/4_consultarItemMaterial"
	const item = (codigoItem: number, overrides: Record<string, unknown> = {}) => ({
		codigoItem,
		codigoPdm: 500,
		descricaoItem: `ITEM ${codigoItem}`,
		statusItem: true,
		itemSustentavel: false,
		codigoNcm: "04011010",
		descricaoNcm: null,
		aplicaMargemPreferencia: null,
		dataHoraAtualizacao: "2021-10-16T09:43:08.030221",
		...overrides,
	})

	test("desativação na API passa pelo diff (o trigger de first_deactivation_detected_at dispara)", async () => {
		const db = newDb()
		apiPages.set(ITEM_ENDPOINT, [[item(1), item(2)], [item(3)]])
		expect(await syncMaterialItem(asClient(db), noProgress)).toBe(3)

		db.resetCounters()
		expect(await syncMaterialItem(asClient(db), noProgress)).toBe(0)
		expect(db.upserts).toEqual([])

		// Campo alternativo (`codigo_ncm` snake_case) com o mesmo valor não é mudança.
		apiPages.set(ITEM_ENDPOINT, [[item(1), item(2, { statusItem: false })], [item(3, { codigoNcm: undefined, codigo_ncm: "04011010" })]])
		db.resetCounters()
		expect(await syncMaterialItem(asClient(db), noProgress)).toBe(1)
		expect(db.rows("compras_material_item").find((row) => row.codigo_item === 2)?.status_item).toBe(false)
	})
})

describe("syncMaterialUnidadeFornecimento sem regravação", () => {
	test("capacidade '1,5' da API bate com o numeric(12,4) '1.5000' do banco", async () => {
		const db = newDb()
		const unit = (seq: number, capacidade: unknown) => ({
			codigoPdm: 500,
			numeroSequencialUnidadeFornecimento: seq,
			siglaUnidadeFornecimento: "KG",
			nomeUnidadeFornecimento: "QUILOGRAMA",
			descricaoUnidadeFornecimento: null,
			siglaUnidadeMedida: "KG",
			capacidadeUnidadeFornecimento: capacidade,
			statusUnidadeFornecimentoPdm: true,
			dataHoraAtualizacao: "2024-01-15T10:30:00",
		})
		apiPages.set("/modulo-material/6_consultarMaterialUnidadeFornecimento", [[unit(1, "1,5"), unit(2, 12), unit(2, 12), unit(3, null)]])
		expect(await syncMaterialUnidadeFornecimento(asClient(db), noProgress)).toBe(3)
		db.resetCounters()
		expect(await syncMaterialUnidadeFornecimento(asClient(db), noProgress)).toBe(0)

		apiPages.set("/modulo-material/6_consultarMaterialUnidadeFornecimento", [[unit(1, "1,75"), unit(2, 12), unit(3, null)]])
		db.resetCounters()
		expect(await syncMaterialUnidadeFornecimento(asClient(db), noProgress)).toBe(1)
		expect(
			db.rows("compras_material_unidade_fornecimento").find((row) => row.numero_sequencial_unidade_fornecimento === 1)?.capacidade_unidade_fornecimento
		).toBe("1.7500")
	})
})

describe("servico sem regravação", () => {
	test("item e unidade de medida: 2ª execução igual não grava", async () => {
		const db = newDb()
		apiPages.set("/modulo-servico/6_consultarItemServico", [
			[
				{ codigoServico: 10, codigoSubclasse: 7, nomeServico: "LIMPEZA", codigoCpc: 85330, exclusivoCentralCompras: false, statusServico: true },
				{ codigoServico: 11, codigoSubclasse: null, nomeServico: "VIGILÂNCIA", statusServico: true, dataHoraAtualizacao: "2024-01-15T10:30:00" },
			],
		])
		apiPages.set("/modulo-servico/7_consultarUndMedidaServico", [
			[
				{ codigoServico: 10, siglaUnidadeMedida: "M2", nomeUnidadeMedida: "METRO QUADRADO", statusUnidadeMedida: true },
				{ codigoServico: 10, siglaUnidadeMedida: "H", statusUnidadeMedida: true },
			],
		])
		expect(await syncServicoItem(asClient(db), noProgress)).toBe(2)
		expect(await syncServicoUnidadeMedida(asClient(db), noProgress)).toBe(2)
		db.resetCounters()
		expect(await syncServicoItem(asClient(db), noProgress)).toBe(0)
		expect(await syncServicoUnidadeMedida(asClient(db), noProgress)).toBe(0)
		expect(db.upserts).toEqual([])
	})
})
