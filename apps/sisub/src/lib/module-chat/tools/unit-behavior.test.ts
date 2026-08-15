/**
 * Comportamento das tools do módulo `unit` — o que elas RESPONDEM, não só onde consultam.
 *
 * `table-schemas.test.ts` cobre o destino da query; este arquivo cobre o resultado. A
 * distinção não é acadêmica: `get_unit_dashboard` consultava a tabela certa, descartava o
 * erro e devolvia `recentAtas: []` com `success: true` — o modelo lia lista vazia e afirmava
 * ao usuário que a unidade não tinha ATA nenhuma. Nenhum teste de roteamento vê isso.
 *
 * O client falso responde por tabela, na ordem das chamadas, e grava os operadores aplicados
 * (`select`, `eq`, `is`…) para as asserções sobre coluna e filtro.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { UserPermission } from "@/types/domain/permissions"
import type { ToolContext } from "./shared"
import { ToolPermissionError } from "./shared"
import { unitTools } from "./unit"

const UNIT_ID = 7
const OTHER_UNIT_ID = 99
const UUID = "11111111-1111-4111-8111-111111111111"

interface QueryResult {
	data?: unknown
	error?: { message: string; code?: string } | null
	count?: number | null
}

interface RecordedQuery {
	table: string
	schema: string
	ops: Array<{ op: string; args: unknown[] }>
}

function tool(name: string) {
	const def = unitTools.find((t) => t.name === name)
	if (!def) throw new Error(`tool ${name} não existe`)
	return def
}

/**
 * Respostas por tabela, consumidas em ordem — `get_unit_dashboard` consulta
 * `procurement_list` duas vezes (contagem e listagem) e cada uma tem seu resultado.
 * Esgotada a fila, a última resposta se repete.
 */
function fakeClient(responses: Record<string, QueryResult[]>, queries: RecordedQuery[]) {
	const pending: Record<string, QueryResult[]> = Object.fromEntries(Object.entries(responses).map(([table, list]) => [table, [...list]]))
	let pendingSchema: string | null = null

	function nextResult(table: string): QueryResult {
		const queue = pending[table]
		if (!queue?.length) throw new Error(`sem resposta configurada para a tabela "${table}"`)
		return queue.length === 1 ? queue[0] : (queue.shift() as QueryResult)
	}

	function chain(table: string, record: RecordedQuery) {
		let single = false
		const proxy: Record<string | symbol, unknown> = new Proxy(
			{},
			{
				get(_target, prop) {
					if (prop === "then") {
						return (resolve: (value: unknown) => void) => {
							const result = nextResult(table)
							const data = result.error ? null : (result.data ?? (single ? null : []))
							resolve({ data: single && Array.isArray(data) ? (data[0] ?? null) : data, error: result.error ?? null, count: result.count ?? null })
						}
					}
					return (...args: unknown[]) => {
						if (prop === "single" || prop === "maybeSingle") single = true
						record.ops.push({ op: String(prop), args })
						return proxy
					}
				},
			}
		)
		return proxy
	}

	const client = {
		schema(name: string) {
			pendingSchema = name
			return client
		},
		from(table: string) {
			const record: RecordedQuery = { table, schema: pendingSchema ?? "kitchen", ops: [] }
			pendingSchema = null
			queries.push(record)
			return chain(table, record)
		},
	}
	return client as unknown as ToolContext["supabase"]
}

function ctxFor(responses: Record<string, QueryResult[]>, queries: RecordedQuery[], level = 2): ToolContext {
	const permission = { module: "unit", level, mess_hall_id: null, kitchen_id: null, unit_id: UNIT_ID } as UserPermission
	return {
		userId: "user-1",
		permissions: [permission],
		module: "unit",
		scopeId: UNIT_ID,
		supabase: fakeClient(responses, queries),
		db: {} as ToolContext["db"],
	}
}

/** Argumento textual de `.select(...)`, para conferir a coluna pedida. */
function selectArg(query: RecordedQuery | undefined): string {
	return String(query?.ops.find((o) => o.op === "select")?.args[0] ?? "")
}

function hasOp(query: RecordedQuery | undefined, op: string, args: unknown[]): boolean {
	return (query?.ops ?? []).some((o) => o.op === op && JSON.stringify(o.args) === JSON.stringify(args))
}

describe("get_unit_dashboard", () => {
	test("devolve a contagem de publicadas e as ATAs recentes pelo título", async () => {
		const queries: RecordedQuery[] = []
		const ctx = ctxFor(
			{
				procurement_list: [{ count: 3 }, { data: [{ id: UUID, title: "ATA 2026/1", status: "published", created_at: "2026-08-01T00:00:00Z" }] }],
			},
			queries
		)

		const result = await tool("get_unit_dashboard").handler({}, ctx)

		expect(result.success).toBe(true)
		expect(result.data).toEqual({
			publishedAtaCount: 3,
			recentAtas: [{ id: UUID, title: "ATA 2026/1", status: "published", created_at: "2026-08-01T00:00:00Z" }],
		})
		// A coluna é `title`. Com `name` — o que estava escrito — o PostgREST recusa a query.
		expect(selectArg(queries[1])).toContain("title")
		expect(selectArg(queries[1])).not.toContain("name")
		// Contagem e listagem têm que concordar sobre o que está na lixeira.
		expect(hasOp(queries[0], "is", ["deleted_at", null])).toBe(true)
		expect(hasOp(queries[1], "is", ["deleted_at", null])).toBe(true)
	})

	test("erro na contagem vira erro de tool, não dashboard vazio", async () => {
		const queries: RecordedQuery[] = []
		const ctx = ctxFor({ procurement_list: [{ error: { message: "column does not exist", code: "42703" } }] }, queries)

		const result = await tool("get_unit_dashboard").handler({}, ctx)

		expect(result.success).toBe(false)
		expect(result.data).toBeUndefined()
	})

	test("erro na listagem vira erro de tool, não lista vazia com cara de sucesso", async () => {
		const queries: RecordedQuery[] = []
		const ctx = ctxFor({ procurement_list: [{ count: 3 }, { error: { message: "column does not exist", code: "42703" } }] }, queries)

		const result = await tool("get_unit_dashboard").handler({}, ctx)

		// Este é o bug que motivou o teste: antes respondia
		// `{ success: true, data: { publishedAtaCount: 3, recentAtas: [] } }`.
		expect(result.success).toBe(false)
		expect(JSON.stringify(result.data ?? {})).not.toContain("recentAtas")
	})
})

describe("get_ata_details", () => {
	const ataRow = (items: Array<Record<string, unknown>>, unitId = UNIT_ID) => ({
		id: UUID,
		unit_id: unitId,
		title: "ATA 2026/1",
		status: "published",
		kitchens: [{ id: "k1", selections: [] }],
		items,
	})

	const item = (n: number, name: string) => ({
		id: `item-${n}`,
		ingredient_id: UUID,
		ingredient_name: name,
		measure_unit: "KG",
		total_quantity: n,
		unit_price: 1.5,
		catmat_item_codigo: 1000 + n,
		// Colunas que existem na linha e NÃO podem sair na resposta.
		created_at: "2026-08-01T00:00:00Z",
		deleted_at: null,
		procurement_list_id: UUID,
	})

	test("projeta o item nas colunas da conversa e conta o que ficou de fora", async () => {
		const queries: RecordedQuery[] = []
		const items = Array.from({ length: 40 }, (_unused, i) => item(i, `Insumo ${i}`))
		const ctx = ctxFor({ procurement_list: [{ data: [ataRow(items)] }] }, queries)

		const result = await tool("get_ata_details").handler({ ataId: UUID }, ctx)
		const data = result.data as { items: Array<Record<string, unknown>>; items_returned: number; items_matched: number; items_total: number }

		expect(result.success).toBe(true)
		// Padrão de 30 itens: o resto fica no contador, não no payload.
		expect(data.items_returned).toBe(30)
		expect(data.items_matched).toBe(40)
		expect(data.items_total).toBe(40)
		expect(data.items).toHaveLength(30)
		expect(Object.keys(data.items[0]).sort()).toEqual([
			"catmat_item_codigo",
			"id",
			"ingredient_id",
			"ingredient_name",
			"measure_unit",
			"total_quantity",
			"unit_price",
		])
	})

	test("itemSearch filtra por nome sem distinguir caixa e o contador reflete o filtro", async () => {
		const queries: RecordedQuery[] = []
		const items = [item(1, "Arroz polido"), item(2, "Feijão preto"), item(3, "ARROZ parboilizado")]
		const ctx = ctxFor({ procurement_list: [{ data: [ataRow(items)] }] }, queries)

		const result = await tool("get_ata_details").handler({ ataId: UUID, itemSearch: "arroz" }, ctx)
		const data = result.data as { items: Array<{ ingredient_name: string }>; items_matched: number; items_total: number }

		expect(data.items_matched).toBe(2)
		expect(data.items_total).toBe(3)
		expect(data.items.map((i) => i.ingredient_name)).toEqual(["Arroz polido", "ARROZ parboilizado"])
	})

	test("limit é grampeado no teto da tool", async () => {
		const queries: RecordedQuery[] = []
		const items = Array.from({ length: 150 }, (_unused, i) => item(i, `Insumo ${i}`))
		const ctx = ctxFor({ procurement_list: [{ data: [ataRow(items)] }] }, queries)

		const result = await tool("get_ata_details").handler({ ataId: UUID, limit: 5000 }, ctx)
		const data = result.data as { items_returned: number; items_limit: number }

		expect(data.items_limit).toBe(100)
		expect(data.items_returned).toBe(100)
	})

	test("ATA de outra unidade é negada pela unidade da LINHA, não pela do pedido", async () => {
		const queries: RecordedQuery[] = []
		const ctx = ctxFor({ procurement_list: [{ data: [ataRow([item(1, "Arroz")], OTHER_UNIT_ID)] }] }, queries)

		await expect(tool("get_ata_details").handler({ ataId: UUID }, ctx)).rejects.toThrow(ToolPermissionError)
	})

	test("ATA inexistente responde 'não encontrada' em vez de vazar erro do banco", async () => {
		const queries: RecordedQuery[] = []
		const ctx = ctxFor({ procurement_list: [{ error: { message: "no rows", code: "PGRST116" } }] }, queries)

		const result = await tool("get_ata_details").handler({ ataId: UUID }, ctx)

		expect(result.success).toBe(false)
		expect(result.error).toBe("ATA não encontrada")
	})
})

describe("search_arp", () => {
	let fetchMock: ReturnType<typeof vi.fn>

	function stubFetch(response: Response | Error) {
		fetchMock = vi.fn(async () => {
			if (response instanceof Error) throw response
			return response
		})
		vi.stubGlobal("fetch", fetchMock)
	}

	function jsonResponse(body: unknown, status = 200) {
		return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
	}

	beforeEach(() => {
		stubFetch(jsonResponse({ resultado: [{ numeroAta: "1/2026" }] }))
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	test("consulta o Compras.gov.br com a UASG da unidade e devolve o resultado", async () => {
		const queries: RecordedQuery[] = []
		const ctx = ctxFor({ units: [{ data: [{ uasg: "120001" }] }] }, queries)

		const result = await tool("search_arp").handler({}, ctx)

		expect(result.success).toBe(true)
		expect(result.data).toMatchObject({ uasg: "120001", resultado: [{ numeroAta: "1/2026" }] })

		const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
		expect(url.searchParams.get("codigoUnidadeGerenciadora")).toBe("120001")
		expect(url.searchParams.get("tamanhoPagina")).toBe("20")
		// Janela de vigência de um ano, fim ≥ início.
		const min = String(url.searchParams.get("dataVigenciaInicialMin"))
		const max = String(url.searchParams.get("dataVigenciaInicialMax"))
		expect(min < max).toBe(true)
		expect(Math.round((Date.parse(max) - Date.parse(min)) / 86_400_000)).toBe(365)
	})

	test("unidade sem UASG não vai para a rede — responde o motivo", async () => {
		const queries: RecordedQuery[] = []
		const ctx = ctxFor({ units: [{ data: [{ uasg: null }] }] }, queries)

		const result = await tool("search_arp").handler({}, ctx)

		expect(result.success).toBe(false)
		expect(result.error).toContain("UASG")
		expect(fetchMock).not.toHaveBeenCalled()
	})

	test("falha HTTP do Compras.gov.br vira erro de tool legível", async () => {
		stubFetch(jsonResponse({ erro: "indisponível" }, 503))
		const queries: RecordedQuery[] = []
		const ctx = ctxFor({ units: [{ data: [{ uasg: "120001" }] }] }, queries)

		const result = await tool("search_arp").handler({}, ctx)

		expect(result.success).toBe(false)
		expect(result.error).toContain("503")
	})

	test("resposta que não é objeto não quebra a tool", async () => {
		stubFetch(jsonResponse("texto solto"))
		const queries: RecordedQuery[] = []
		const ctx = ctxFor({ units: [{ data: [{ uasg: "120001" }] }] }, queries)

		const result = await tool("search_arp").handler({}, ctx)

		expect(result.success).toBe(true)
		expect(result.data).toEqual({ uasg: "120001", resultado: [] })
	})
})
