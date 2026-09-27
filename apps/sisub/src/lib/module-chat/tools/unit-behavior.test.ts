/**
 * Comportamento das tools do módulo `unit` — o que elas RESPONDEM, não só onde consultam.
 *
 * `table-schemas.test.ts` cobre o destino da query; este arquivo cobre o resultado. A
 * distinção não é acadêmica: `get_unit_dashboard` consultava a tabela certa, descartava o
 * erro e devolvia a lista de anexos vazia com `success: true` — o modelo lia lista vazia e
 * afirmava ao usuário que a unidade não tinha anexo nenhum. Nenhum teste de roteamento vê isso.
 *
 * O client falso responde por tabela, na ordem das chamadas, e grava os operadores aplicados
 * (`select`, `eq`, `is`…) para as asserções sobre coluna e filtro.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { UserPermission } from "@/types/domain/permissions"
import type { ToolContext } from "./shared"
import { unitTools } from "./unit"

const UNIT_ID = 7
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
 * Respostas por tabela, consumidas em ordem. Esgotada a fila, a última resposta se repete.
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

// ── Tools do anexo quantitativo: delegam ao domínio ─────────────────────────
//
// `list_quantity_estimates`, `get_quantity_estimate`, `update_quantity_estimate_status` e o
// resumo do `get_unit_dashboard` não montam PostgREST: leem por `@iefa/sisub-domain/agent` e
// escrevem pela operation (`.claude/rules/ai-tools.md`). O que o domínio faz — projeção dos
// itens, filtro por nome, teto, unidade conferida pela LINHA, lixeira fora, recusa do wizard e o
// `published` antigo lido como `completed` — está nos casos `agent*` de
// `quantity-estimate.operations.test.ts`, contra o banco. Aqui
// fica o contrato entre a tool e o domínio: entrada validada, escopo da rota, envelope e erro
// que sobe em vez de virar lista vazia.

const agentMocks = vi.hoisted(() => ({
	agentListQuantityEstimates: vi.fn(),
	agentGetQuantityEstimate: vi.fn(),
	agentUpdateQuantityEstimateStatus: vi.fn(),
}))

vi.mock("@iefa/sisub-domain/agent", async (importOriginal) => ({
	...(await importOriginal<typeof import("@iefa/sisub-domain/agent")>()),
	agentListQuantityEstimates: agentMocks.agentListQuantityEstimates,
	agentGetQuantityEstimate: agentMocks.agentGetQuantityEstimate,
	agentUpdateQuantityEstimateStatus: agentMocks.agentUpdateQuantityEstimateStatus,
}))

const envelope = (items: unknown[], total = items.length) => ({ items, returned: items.length, total, limit: 30 })

describe("get_unit_dashboard", () => {
	beforeEach(() => {
		agentMocks.agentListQuantityEstimates.mockReset()
	})

	test("conta os concluídos pelo total do domínio e lista os recentes pelo título", async () => {
		const recent = {
			id: UUID,
			title: "Anexo 2026/1",
			status: "completed",
			wizard_step: null,
			segment_id: null,
			created_at: "2026-08-01T00:00:00Z",
			updated_at: null,
		}
		agentMocks.agentListQuantityEstimates.mockImplementation(async (_db, _ctx, input: { status?: string }) =>
			input.status === "completed" ? envelope([recent], 3) : envelope([recent])
		)

		const result = await tool("get_unit_dashboard").handler({}, ctxFor({}, []))

		expect(result.success).toBe(true)
		expect(result.data).toEqual({
			completedQuantityEstimateCount: 3,
			recentQuantityEstimates: [{ id: UUID, title: "Anexo 2026/1", status: "completed", created_at: "2026-08-01T00:00:00Z" }],
		})
		// O escopo é a unidade da rota, nunca um argumento do modelo.
		for (const call of agentMocks.agentListQuantityEstimates.mock.calls) expect(call[2]).toMatchObject({ unitId: UNIT_ID })
	})

	test("erro de leitura sobe como erro, não como dashboard vazio", async () => {
		// Este é o bug que motivou o teste: antes respondia
		// `{ success: true, data: { completedQuantityEstimateCount: 3, recentQuantityEstimates: [] } }`.
		agentMocks.agentListQuantityEstimates.mockRejectedValue(new Error("column does not exist"))

		await expect(tool("get_unit_dashboard").handler({}, ctxFor({}, []))).rejects.toThrow("column does not exist")
	})
})

describe("list_quantity_estimates", () => {
	beforeEach(() => {
		agentMocks.agentListQuantityEstimates.mockReset()
	})

	test("repassa status e limit validados com a unidade da rota e devolve o envelope com total", async () => {
		agentMocks.agentListQuantityEstimates.mockResolvedValue(envelope([{ id: UUID }], 12))

		const result = await tool("list_quantity_estimates").handler({ status: "completed", limit: 1 }, ctxFor({}, []))

		expect(agentMocks.agentListQuantityEstimates.mock.calls[0]?.[2]).toEqual({ status: "completed", limit: 1, unitId: UNIT_ID })
		expect(result.data).toEqual({ quantityEstimates: [{ id: UUID }], returned: 1, total: 12, limit: 30 })
	})

	test("o status antigo `published` não é entrada válida", async () => {
		await expect(tool("list_quantity_estimates").handler({ status: "published" }, ctxFor({}, []))).rejects.toThrow()
		expect(agentMocks.agentListQuantityEstimates).not.toHaveBeenCalled()
	})
})

describe("get_quantity_estimate", () => {
	beforeEach(() => {
		agentMocks.agentGetQuantityEstimate.mockReset()
	})

	test("devolve o que o domínio projetou", async () => {
		const detail = { id: UUID, title: "Anexo 2026/1", items: [], items_total: 0 }
		agentMocks.agentGetQuantityEstimate.mockResolvedValue(detail)

		const result = await tool("get_quantity_estimate").handler({ quantityEstimateId: UUID, itemSearch: "arroz", limit: 5 }, ctxFor({}, []))

		expect(agentMocks.agentGetQuantityEstimate.mock.calls[0]?.[2]).toEqual({ quantityEstimateId: UUID, itemSearch: "arroz", limit: 5 })
		expect(result).toEqual({ success: true, data: detail })
	})

	test("id que não é UUID não chega ao domínio", async () => {
		await expect(tool("get_quantity_estimate").handler({ quantityEstimateId: "anexo-1" }, ctxFor({}, []))).rejects.toThrow()
		expect(agentMocks.agentGetQuantityEstimate).not.toHaveBeenCalled()
	})
})

describe("update_quantity_estimate_status", () => {
	beforeEach(() => {
		agentMocks.agentUpdateQuantityEstimateStatus.mockReset()
	})

	test("conclui pela operation do domínio (transição, justificativa e retrato), não por update cru", async () => {
		agentMocks.agentUpdateQuantityEstimateStatus.mockResolvedValue(undefined)

		const result = await tool("update_quantity_estimate_status").handler({ quantityEstimateId: UUID, status: "completed" }, ctxFor({}, []))

		expect(agentMocks.agentUpdateQuantityEstimateStatus.mock.calls[0]?.[2]).toEqual({ quantityEstimateId: UUID, status: "completed" })
		expect(result).toEqual({ success: true, data: { quantityEstimateId: UUID, status: "completed" } })
	})

	test("`published` (publicar é divulgar no PNCP) não é status do anexo", async () => {
		await expect(tool("update_quantity_estimate_status").handler({ quantityEstimateId: UUID, status: "published" }, ctxFor({}, []))).rejects.toThrow()
		expect(agentMocks.agentUpdateQuantityEstimateStatus).not.toHaveBeenCalled()
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

		// O client tipado (openapi-fetch) chama fetch com um Request, não com uma string.
		const called = fetchMock.mock.calls[0]?.[0]
		const url = new URL(called instanceof Request ? called.url : String(called))
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
		// A janela consultada volta junto: sem ela o modelo lê `resultado: []` e
		// conclui que a unidade não tem ARP nenhuma, quando pode só estar fora do período.
		expect(result.data).toMatchObject({ uasg: "120001", resultado: [] })
		expect(result.data).toHaveProperty("vigencia.min")
		expect(result.data).toHaveProperty("vigencia.max")
	})
})
