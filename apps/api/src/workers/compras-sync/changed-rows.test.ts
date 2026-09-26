import { describe, expect, test } from "bun:test"
import { collectLookupValues, EXISTING_PAGE_SIZE, fetchExistingRows, LOOKUP_CHUNK_SIZE, selectChangedRows } from "./changed-rows.ts"
import { FakePostgrest } from "./fake-postgrest.test-support.ts"
import { ROW_SPECS } from "./row-specs.ts"

const spec = ROW_SPECS.servicoUnidadeMedida

// O client do Supabase é genérico demais para o fake; ele cobre só o que o sync usa.
const asClient = (db: FakePostgrest) => db as any

function newDb(): FakePostgrest {
	return new FakePostgrest().define(spec.table, ["codigo_servico", "sigla_unidade_medida"], {
		codigo_servico: "integer",
		sigla_unidade_medida: "text",
		nome_unidade_medida: "text",
		status_unidade_medida: "boolean",
	})
}

const row = (codigoServico: number, sigla: string) => ({
	codigo_servico: codigoServico,
	sigla_unidade_medida: sigla,
	nome_unidade_medida: null,
	status_unidade_medida: true,
	synced_at: "2026-09-26T06:00:00Z",
})

describe("fetchExistingRows", () => {
	test("quebra o .in() em lotes que cabem na URL", async () => {
		const db = newDb()
		const values = Array.from({ length: LOOKUP_CHUNK_SIZE * 2 + 1 }, (_, index) => index + 1)
		await fetchExistingRows(asClient(db), spec, values)
		expect(db.selects.map((s) => s.lookupCount)).toEqual([LOOKUP_CHUNK_SIZE, LOOKUP_CHUNK_SIZE, 1])
	})

	test("pagina quando a chave-pai devolve mais que uma página", async () => {
		const db = newDb()
		const many = Array.from({ length: EXISTING_PAGE_SIZE + 5 }, (_, index) => row(1, `U${index}`))
		await db.from(spec.table).upsert(many)
		db.resetCounters()
		const existing = await fetchExistingRows(asClient(db), spec, [1])
		expect(existing).toHaveLength(EXISTING_PAGE_SIZE + 5)
		expect(db.selects.map((s) => [s.from, s.to])).toEqual([
			[0, EXISTING_PAGE_SIZE - 1],
			[EXISTING_PAGE_SIZE, EXISTING_PAGE_SIZE * 2 - 1],
		])
	})

	test("lê só as colunas de negócio (sem synced_at)", async () => {
		const db = newDb()
		await db.from(spec.table).upsert([row(1, "M2")])
		const [existing] = await fetchExistingRows(asClient(db), spec, [1])
		expect(Object.keys(existing).sort()).toEqual(Object.keys(spec.columns).sort())
	})
})

describe("collectLookupValues", () => {
	test("distintos, normalizados e sem NULL", () => {
		expect(collectLookupValues(spec, [row(1, "A"), row(1, "B"), { ...row(2, "A"), codigo_servico: "2" }, { ...row(3, "A"), codigo_servico: null }])).toEqual([
			1, 2,
		])
	})
})

describe("selectChangedRows", () => {
	test("lote vazio não consulta o banco", async () => {
		const db = newDb()
		expect(await selectChangedRows(asClient(db), spec, [])).toEqual({ changed: [], unchanged: 0 })
		expect(db.selects).toEqual([])
	})
})
