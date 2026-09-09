import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { OpenAPIHono } from "@hono/zod-openapi"
import { catalogRoutes, createCatalogRoutes, FOLDER_COLUMNS, FolderSchema, INGREDIENT_COLUMNS, IngredientSchema } from "./catalog.ts"

type Call = { method: string; args: unknown[] }
type QueryResult = { data: unknown[] | null; error: unknown; count: number | null }

/**
 * Fake do builder do PostgREST. Registra a cadeia inteira para que o teste possa afirmar sobre
 * a PROJEÇÃO e o RECORTE — que é onde mora a garantia de uma rota anônima —, e não só sobre o
 * corpo da resposta.
 */
class FakeQueryBuilder {
	calls: Call[] = []

	constructor(private result: QueryResult) {}

	private record(method: string, ...args: unknown[]) {
		this.calls.push({ method, args })
		return this
	}

	select(columns: string, options?: unknown) {
		return this.record("select", columns, options)
	}
	is(column: string, value: unknown) {
		return this.record("is", column, value)
	}
	eq(column: string, value: unknown) {
		return this.record("eq", column, value)
	}
	in(column: string, values: unknown) {
		return this.record("in", column, values)
	}
	ilike(column: string, value: unknown) {
		return this.record("ilike", column, value)
	}
	order(column: string, options?: unknown) {
		return this.record("order", column, options)
	}
	range(from: number, to: number) {
		return this.record("range", from, to)
	}

	// biome-ignore lint/suspicious/noThenProperty: o builder do PostgREST é um thenable e o handler faz await nele
	then(resolve: (r: QueryResult) => unknown) {
		return Promise.resolve(resolve(this.result))
	}
}

class FakeSupabase {
	builders: Array<{ table: string; builder: FakeQueryBuilder }> = []

	constructor(private result: QueryResult) {}

	from(table: string) {
		const builder = new FakeQueryBuilder(this.result)
		this.builders.push({ table, builder })
		return builder
	}

	/** Última cadeia executada — o teste só dispara uma requisição por vez. */
	get lastCalls() {
		return this.builders[this.builders.length - 1].builder.calls
	}

	callArgs(method: string) {
		return this.lastCalls.filter((call) => call.method === method).map((call) => call.args)
	}
}

function appWith(result: Partial<QueryResult> = {}) {
	// `count` compara com `undefined` em vez de usar `??`: `count: null` é um caso de teste real
	// (contagem ausente), e com `??` viraria 0 em silêncio — o teste passaria sem exercitar nada.
	const supabase = new FakeSupabase({ data: result.data ?? [], error: result.error ?? null, count: result.count === undefined ? 0 : result.count })
	const app = createCatalogRoutes({ getSupabase: () => supabase as any })
	return { app, supabase }
}

const INGREDIENT_ROW = {
	id: "11111111-1111-4111-8111-111111111111",
	description: "Arroz polido tipo 1",
	measure_unit: "KG",
	correction_factor: "1.00",
	density_factor: null,
	rehydration_index: "2.50",
	folder_id: "22222222-2222-4222-8222-222222222222",
	created_at: "2026-01-02T03:04:05+00:00",
}

describe("GET /api/catalog/ingredients — forma da resposta", () => {
	test("devolve o envelope paginado com data, total, limit e offset", async () => {
		const { app } = appWith({ data: [INGREDIENT_ROW], count: 1779 })
		const res = await app.request("/ingredients")
		const body = (await res.json()) as any

		expect(res.status).toBe(200)
		expect(Array.isArray(body.data)).toBe(true)
		expect(body.limit).toBe(50)
		expect(body.offset).toBe(0)
		expect(body.total).toBe(1779)
	})

	test("`total` é a contagem do catálogo inteiro, não o tamanho da página", async () => {
		// Sem isso o consumidor lê a primeira página e conclui que o catálogo tem 1 item.
		const { app } = appWith({ data: [INGREDIENT_ROW], count: 1779 })
		const body = (await (await app.request("/ingredients?limit=1")).json()) as any

		expect(body.data.length).toBe(1)
		expect(body.total).toBe(1779)
		expect(body.total).not.toBe(body.data.length)
	})

	test("pede a contagem exata ao PostgREST", async () => {
		const { app, supabase } = appWith()
		await app.request("/ingredients")
		expect(supabase.callArgs("select")[0][1]).toEqual({ count: "exact" })
	})

	test("converte as colunas numeric (que o PostgREST devolve como string) em número", async () => {
		const { app } = appWith({ data: [INGREDIENT_ROW], count: 1 })
		const body = (await (await app.request("/ingredients")).json()) as any
		const item = body.data[0]

		expect(item.correction_factor).toBe(1)
		expect(item.rehydration_index).toBe(2.5)
		expect(item.density_factor).toBeNull()
	})

	test("responde com Cache-Control público", async () => {
		const { app } = appWith()
		const res = await app.request("/ingredients")
		expect(res.headers.get("Cache-Control")).toBe("public, max-age=300")
	})

	test("resposta de erro não é cacheável — 400 com max-age gruda o erro na borda", async () => {
		const { app } = appWith()
		const res = await app.request("/ingredients?order=legacy_id")
		expect(res.status).toBe(400)
		expect(res.headers.get("Cache-Control")).toBeNull()
	})
})

describe("GET /api/catalog/ingredients — paginação", () => {
	test("limit tem teto: 999999 vira 200", async () => {
		const { app, supabase } = appWith()
		const body = (await (await app.request("/ingredients?limit=999999")).json()) as any

		expect(body.limit).toBe(200)
		expect(supabase.callArgs("range")[0]).toEqual([0, 199])
	})

	test("limit ausente usa o padrão 50", async () => {
		const { app, supabase } = appWith()
		await app.request("/ingredients")
		expect(supabase.callArgs("range")[0]).toEqual([0, 49])
	})

	test("limit inválido ou zero não vira página vazia nem negativa", async () => {
		const { app, supabase } = appWith()
		await app.request("/ingredients?limit=0")
		expect(supabase.callArgs("range")[0]).toEqual([0, 0])
	})

	test("offset desloca a janela e volta no envelope", async () => {
		const { app, supabase } = appWith()
		const body = (await (await app.request("/ingredients?limit=10&offset=100")).json()) as any

		expect(body.offset).toBe(100)
		expect(supabase.callArgs("range")[0]).toEqual([100, 109])
	})

	test("offset negativo volta para a primeira página", async () => {
		const { app, supabase } = appWith()
		await app.request("/ingredients?limit=10&offset=-99")
		expect(supabase.callArgs("range")[0]).toEqual([0, 9])
	})
})

describe("GET /api/catalog/ingredients — projeção pública", () => {
	test("a projeção é exatamente a allow-list, nunca `select *`", async () => {
		const { app, supabase } = appWith()
		await app.request("/ingredients")
		const select = supabase.callArgs("select")[0][0] as string

		expect(select).toBe(INGREDIENT_COLUMNS.join(", "))
		expect(select).not.toContain("*")
	})

	/**
	 * Guarda contra ampliação silenciosa: campo publicado numa rota anônima é permanente.
	 * Preço, vínculo de compra, revisão interna, id de usuário e id legado NÃO saem daqui.
	 */
	test("nenhuma coluna não-pública entra na projeção", async () => {
		const forbidden = [
			"unit_price",
			"price",
			"purchase_item",
			"purchase_item_id",
			"catmat",
			"legacy_id",
			"deleted_at",
			"reviewed_by",
			"reviewed_at",
			"changed_by",
			"user_id",
			"created_by",
			"draft",
			"kitchen_id",
		]
		const { app, supabase } = appWith()
		await app.request("/ingredients")
		const select = supabase.callArgs("select")[0][0] as string

		for (const column of forbidden) expect(select.includes(column)).toBe(false)
		for (const column of forbidden) expect(INGREDIENT_COLUMNS as readonly string[]).not.toContain(column)
	})

	test("o corpo devolvido não carrega campo fora da allow-list", async () => {
		const { app } = appWith({ data: [INGREDIENT_ROW], count: 1 })
		const body = (await (await app.request("/ingredients")).json()) as any
		expect(Object.keys(body.data[0]).sort()).toEqual([...INGREDIENT_COLUMNS].sort())
	})
})

describe("GET /api/catalog/ingredients — recorte de linha", () => {
	test("nunca publica linha com soft delete nem preparação herdada do SISUBWEB", async () => {
		const { app, supabase } = appWith()
		await app.request("/ingredients")
		expect(supabase.callArgs("is")).toEqual([
			["deleted_at", null],
			["preparation_group_id", null],
		])
	})

	test("o recorte não é parametrizável — query string não desliga o filtro", async () => {
		const { app, supabase } = appWith()
		await app.request("/ingredients?deleted_at=all&preparation_group_id=any&select=*")
		expect(supabase.callArgs("is")).toEqual([
			["deleted_at", null],
			["preparation_group_id", null],
		])
		expect(supabase.callArgs("select")[0][0]).toBe(INGREDIENT_COLUMNS.join(", "))
	})
})

describe("GET /api/catalog/ingredients — filtros", () => {
	test("description_ilike vira ilike com curinga dos dois lados", async () => {
		const { app, supabase } = appWith()
		await app.request("/ingredients?description_ilike=arroz")
		expect(supabase.callArgs("ilike")[0]).toEqual(["description", "%arroz%"])
	})

	test("folder_id único usa eq; lista usa in", async () => {
		const single = appWith()
		await single.app.request("/ingredients?folder_id=22222222-2222-4222-8222-222222222222")
		expect(single.supabase.callArgs("eq")[0]).toEqual(["folder_id", "22222222-2222-4222-8222-222222222222"])

		const many = appWith()
		await many.app.request("/ingredients?folder_id=22222222-2222-4222-8222-222222222222,33333333-3333-4333-8333-333333333333")
		expect(many.supabase.callArgs("in")[0]).toEqual(["folder_id", ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"]])
	})

	test("folder_id malformado é 400, não 500", async () => {
		const { app } = appWith()
		const res = await app.request("/ingredients?folder_id=not-a-uuid")
		expect(res.status).toBe(400)
	})

	test("ordena por descrição quando o parâmetro está ausente", async () => {
		const { app, supabase } = appWith()
		await app.request("/ingredients")
		expect(supabase.callArgs("order")[0]).toEqual(["description", { ascending: true }])
	})

	test("coluna de ordenação fora da allow-list é 400, e a resposta não ecoa a entrada", async () => {
		const { app } = appWith()
		const res = await app.request("/ingredients?order=legacy_id:desc")
		const body = (await res.json()) as any

		expect(res.status).toBe(400)
		expect(JSON.stringify(body)).not.toContain("legacy_id")
	})
})

describe("GET /api/catalog/folders", () => {
	test("devolve envelope paginado com a projeção da pasta", async () => {
		const row = {
			id: "22222222-2222-4222-8222-222222222222",
			description: "Cereais",
			parent_id: null,
			catalog_scope: "alimentacao",
			created_at: "2026-01-02T03:04:05+00:00",
		}
		const { app, supabase } = appWith({ data: [row], count: 42 })
		const body = (await (await app.request("/folders")).json()) as any

		expect(body.total).toBe(42)
		expect(body.limit).toBe(50)
		expect(supabase.callArgs("select")[0][0]).toBe(FOLDER_COLUMNS.join(", "))
		expect(Object.keys(body.data[0]).sort()).toEqual([...FOLDER_COLUMNS].sort())
	})

	test("não publica pasta excluída", async () => {
		const { app, supabase } = appWith()
		await app.request("/folders")
		expect(supabase.callArgs("is")).toEqual([["deleted_at", null]])
	})

	test("catalog_scope aceita só os valores do CHECK do banco", async () => {
		const ok = appWith()
		await ok.app.request("/folders?catalog_scope=auxiliar")
		expect(ok.supabase.callArgs("eq")[0]).toEqual(["catalog_scope", "auxiliar"])

		const bad = appWith()
		expect((await bad.app.request("/folders?catalog_scope=secreto")).status).toBe(400)
	})

	test("parent_id malformado é 400", async () => {
		const { app } = appWith()
		expect((await app.request("/folders?parent_id=nope")).status).toBe(400)
	})
})

describe("Catálogo público — erro do banco não vaza", () => {
	let errorSpy: ReturnType<typeof spyOn>

	beforeEach(() => {
		errorSpy = spyOn(console, "error").mockImplementation(() => {})
	})

	afterEach(() => {
		errorSpy.mockRestore()
	})

	test("mensagem do PostgREST fica no log, nunca no corpo da resposta anônima", async () => {
		const { app } = appWith({
			data: null,
			error: { message: "column kitchen.ingredient.unit_price does not exist", code: "42703", hint: "Perhaps you meant..." },
			count: null,
		})
		const res = await app.request("/ingredients")
		const raw = await res.text()

		expect(res.status).toBe(500)
		expect(raw).not.toContain("unit_price")
		expect(raw).not.toContain("42703")
		expect(raw).not.toContain("Perhaps")
		expect(errorSpy).toHaveBeenCalled()
	})
})

/**
 * Requisito duro do catálogo público: SÓ GET.
 *
 * Estes testes falham no instante em que alguém registrar um verbo de escrita neste router —
 * não dependem de ninguém lembrar da regra ao revisar o diff.
 */
describe("Catálogo público — somente leitura", () => {
	const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const

	test("o router não registra nenhum método além de GET", () => {
		const registered = catalogRoutes.routes.filter((route) => route.method !== "ALL")
		expect(registered.length).toBeGreaterThan(0)
		for (const route of registered) expect(route.method).toBe("GET")
	})

	test("o documento OpenAPI do catálogo só declara operações get", () => {
		const app = new OpenAPIHono().route(
			"/api/catalog",
			createCatalogRoutes({ getSupabase: () => new FakeSupabase({ data: [], error: null, count: 0 }) as any })
		)
		const doc = app.getOpenAPIDocument({ openapi: "3.0.0", info: { title: "test", version: "1.0.0" } })
		const catalogPaths = Object.entries(doc.paths).filter(([path]) => path.startsWith("/api/catalog"))

		expect(catalogPaths.length).toBeGreaterThan(0)
		for (const [, operations] of catalogPaths) expect(Object.keys(operations as object)).toEqual(["get"])
	})

	test("verbo de escrita nas rotas do catálogo não é atendido", async () => {
		const { app, supabase } = appWith()
		for (const path of ["/ingredients", "/folders"]) {
			for (const method of WRITE_METHODS) {
				const res = await app.request(path, { method, body: JSON.stringify({ description: "x" }), headers: { "Content-Type": "application/json" } })
				expect(res.status).toBe(404)
			}
		}
		// Nenhuma escrita chegou perto do banco.
		expect(supabase.builders.length).toBe(0)
	})
})

/**
 * Guarda de contrato: a allow-list de colunas e o schema publicado no OpenAPI têm que descrever
 * a MESMA coisa.
 *
 * São duas listas separadas — a projeção que vai ao PostgREST e o schema Zod que vira o
 * documento. Adicionar coluna só na projeção publica um campo que o contrato não menciona;
 * adicionar só no schema promete um campo que nunca vem. Num contrato público e permanente as
 * duas divergências são caras, e nenhuma delas quebra nada até alguém reparar.
 */
describe("Catálogo público — projeção e contrato OpenAPI não divergem", () => {
	test("as colunas do insumo são exatamente as chaves do schema publicado", () => {
		expect(Object.keys(IngredientSchema.shape).sort()).toEqual([...INGREDIENT_COLUMNS].sort())
	})

	test("as colunas da pasta são exatamente as chaves do schema publicado", () => {
		expect(Object.keys(FolderSchema.shape).sort()).toEqual([...FOLDER_COLUMNS].sort())
	})

	test("toda coluna ordenável é também uma coluna publicada — nunca se ordena por dado não exposto", () => {
		const doc = new OpenAPIHono()
			.route("/api/catalog", createCatalogRoutes({ getSupabase: () => new FakeSupabase({ data: [], error: null, count: 0 }) as any }))
			.getOpenAPIDocument({ openapi: "3.0.0", info: { title: "test", version: "1.0.0" } })
		const orderParam = (doc.paths["/api/catalog/ingredients"] as any).get.parameters.find((p: any) => p.name === "order")

		for (const column of ["description", "created_at"]) {
			expect(orderParam.description).toContain(column)
			expect(INGREDIENT_COLUMNS as readonly string[]).toContain(column)
		}
	})
})

describe("Catálogo público — paginação estável e `total` honesto", () => {
	test("a ordenação sempre termina em `id`, senão a paginação por offset repete e perde linha", async () => {
		const { app, supabase } = appWith()
		await app.request("/ingredients?order=created_at:desc")
		expect(supabase.callArgs("order")).toEqual([
			["created_at", { ascending: false }],
			["id", { ascending: true }],
		])
	})

	test("o desempate também vale para a ordenação padrão e para /folders", async () => {
		const ingredients = appWith()
		await ingredients.app.request("/ingredients")
		expect(ingredients.supabase.callArgs("order")).toEqual([
			["description", { ascending: true }],
			["id", { ascending: true }],
		])

		const folders = appWith()
		await folders.app.request("/folders")
		expect(folders.supabase.callArgs("order")).toEqual([
			["description", { ascending: true }],
			["id", { ascending: true }],
		])
	})

	test("contagem ausente é 500, nunca `total` igual ao tamanho da página", async () => {
		const errorSpy = spyOn(console, "error").mockImplementation(() => {})
		const { app } = appWith({ data: [INGREDIENT_ROW], count: null })
		const res = await app.request("/ingredients")

		expect(res.status).toBe(500)
		expect(await res.text()).not.toContain('"total":1')
		expect(errorSpy).toHaveBeenCalled()
		errorSpy.mockRestore()
	})
})

describe("Catálogo público — entrada do cliente é limitada e literal", () => {
	test("offset absurdo é limitado: sem teto o range perde precisão e a janela sai errada", async () => {
		const { app, supabase } = appWith()
		const body = (await (await app.request("/ingredients?limit=50&offset=99999999999999999999")).json()) as any

		expect(body.offset).toBe(1_000_000)
		// A janela continua sendo de `limit` linhas — era isso que a perda de precisão quebrava.
		const [from, to] = supabase.callArgs("range")[0] as [number, number]
		expect(to - from + 1).toBe(50)
	})

	test("curinga do LIKE no filtro é literal — `%` não vira 'traga o catálogo inteiro'", async () => {
		const { app, supabase } = appWith()
		await app.request(`/ingredients?description_ilike=${encodeURIComponent("100%_A")}`)
		expect(supabase.callArgs("ilike")[0]).toEqual(["description", "%100\\%\\_A%"])
	})

	test("lista de filtro longa demais é 400, e não chega a virar query no PostgREST", async () => {
		const uuids = Array.from({ length: 101 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`).join(",")
		const { app, supabase } = appWith()
		const res = await app.request(`/ingredients?folder_id=${uuids}`)

		expect(res.status).toBe(400)
		expect(supabase.builders.length).toBe(0)
	})

	test("measure_unit com valores demais é 400", async () => {
		const { app } = appWith()
		const many = Array.from({ length: 101 }, (_, i) => `U${i}`).join(",")
		expect((await app.request(`/ingredients?measure_unit=${many}`)).status).toBe(400)
	})

	test("ordenação com colunas demais é 400 e não ecoa a entrada", async () => {
		const { app } = appWith()
		const res = await app.request("/ingredients?order=description,created_at,description,created_at")
		expect(res.status).toBe(400)
		expect(JSON.stringify(await res.json())).not.toContain("created_at,description")
	})
})
