/**
 * Contrato de schema das queries cruas do chat: toda tabela consultada tem que ser pedida no
 * schema onde ela realmente mora.
 *
 * O client do chat nasce com `db: { schema: "kitchen" }`. Enquanto `untypedFrom` não recebia
 * schema, `list_atas` pedia `kitchen.procurement_list` — o PostgREST devolvia PGRST205 e a
 * tool respondia "Erro ao executar…". Módulo `unit` inteiro (menos `get_ata_details`) e os
 * quatro tools de `local-analytics` estavam assim, sem nenhum sinal: `untypedFrom` devolve
 * `any`, então typecheck e teste de argumentos passavam verdes.
 *
 * O teste roda os handlers de verdade contra um client falso que grava (schema, tabela) de
 * cada `.from()`, e compara com o mapa abaixo — extraído de `packages/database/drizzle/schema.ts`,
 * a introspecção do banco.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { UserPermission } from "@/types/domain/permissions"
import { localAnalyticsTools } from "./local-analytics"
import type { ModuleToolDefinition, ToolContext } from "./shared"
import { unitTools } from "./unit"

/** Onde cada tabela mora de fato. Fonte: schema introspectado do banco. */
const TABLE_SCHEMA: Record<string, string> = {
	units: "core",
	kitchen: "core",
	procurement_list: "procurement",
	procurement_list_item: "procurement",
	procurement_list_kitchen: "procurement",
	procurement_list_selection: "procurement",
	procurement_arp: "procurement",
	procurement_arp_item: "procurement",
	empenho: "finance",
	daily_menu: "kitchen",
	menu_items: "kitchen",
	meal_type: "kitchen",
	recipes: "kitchen",
	menu_template: "kitchen",
	menu_template_items: "kitchen",
}

const UNIT_ID = 7
const UUID = "11111111-1111-4111-8111-111111111111"

/** Linha genérica: cobre todos os campos que os handlers leem depois da query. */
const ROW = {
	id: UUID,
	unit_id: UNIT_ID,
	kitchen_id: 1,
	ata_id: UUID,
	ata_item_id: UUID,
	arp_id: UUID,
	ingredient_id: UUID,
	ingredient_name: "Arroz polido",
	title: "ATA 2026/1",
	status: "published",
	uasg: "120001",
	code: "BAAF",
	display_name: "Cozinha da Guarnição",
	service_date: "2026-08-14",
	numero_ata: "1/2026",
	ano_ata: "2026",
	data_vigencia_fim: "2026-12-31",
	quantidade_homologada: 100,
	quantidade_empenhada: 95,
	created_at: "2026-08-01T00:00:00Z",
}

interface QueryCall {
	schema: string
	table: string
}

/**
 * Client falso com a mesma semântica de schema do real: `.schema(x)` vale para o `.from()`
 * seguinte e depois volta ao default (`kitchen`).
 */
function recordingClient(calls: QueryCall[]) {
	let pendingSchema: string | null = null

	function chain() {
		let single = false
		const proxy: Record<string | symbol, unknown> = new Proxy(
			{},
			{
				get(_target, prop) {
					if (prop === "then") {
						return (resolve: (value: unknown) => void) => resolve({ data: single ? ROW : [ROW], error: null, count: 1 })
					}
					return (...args: unknown[]) => {
						if (prop === "single" || prop === "maybeSingle") single = true
						void args
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
			calls.push({ schema: pendingSchema ?? "kitchen", table })
			pendingSchema = null
			return chain()
		},
	}
	return client as unknown as ToolContext["supabase"]
}

function ctxFor(calls: QueryCall[], permissions: UserPermission[]): ToolContext {
	return {
		userId: "user-1",
		permissions,
		module: "unit",
		scopeId: UNIT_ID,
		supabase: recordingClient(calls),
		db: {} as ToolContext["db"],
	}
}

function permission(module: string, level: number): UserPermission {
	return { module, level, mess_hall_id: null, kitchen_id: null, unit_id: UNIT_ID } as UserPermission
}

/** Argumentos mínimos por tool para o handler chegar até as queries. */
const ARGS: Record<string, Record<string, unknown>> = {
	get_ata_details: { ataId: UUID },
	update_ata_status: { ataId: UUID, status: "published" },
	list_empenhos: { ataId: UUID },
}

async function runTool(def: ModuleToolDefinition, ctx: ToolContext): Promise<void> {
	// Autorização e validação já têm testes próprios; aqui só interessa aonde a query foi.
	await def.handler(ARGS[def.name] ?? {}, ctx).catch(() => undefined)
}

describe("schema de destino das queries do chat", () => {
	beforeEach(() => {
		// `search_arp` sai para o Compras.gov.br depois de ler a UASG — a rede não entra no teste.
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ resultado: [] }), { status: 200, headers: { "content-type": "application/json" } }))
		)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	test.each([
		["unit", unitTools, [permission("unit", 2)]],
		["local-analytics", localAnalyticsTools, [permission("local-analytics", 2)]],
	] as const)("módulo %s consulta cada tabela no schema certo", async (_module, tools, permissions) => {
		const calls: QueryCall[] = []
		const ctx = ctxFor(calls, permissions as unknown as UserPermission[])

		for (const def of tools) {
			await runTool(def, ctx)
		}

		expect(calls.length).toBeGreaterThan(0)
		for (const call of calls) {
			const expected = TABLE_SCHEMA[call.table]
			expect(expected, `tabela desconhecida no mapa: ${call.table}`).toBeDefined()
			expect(call.schema, `${call.table} consultada em "${call.schema}"`).toBe(expected)
		}
	})

	// Por tool, não por módulo: se um handler morre antes da primeira query, ele sai do
	// contrato de schema sem que a asserção agregada perceba — o outro tool do módulo já
	// gravou chamadas e o teste segue verde.
	test.each([
		["unit", unitTools, [permission("unit", 2)]],
		["local-analytics", localAnalyticsTools, [permission("local-analytics", 2)]],
	] as const)("nenhuma tool de %s escapa sem consultar nada", async (_module, tools, permissions) => {
		for (const def of tools) {
			const calls: QueryCall[] = []
			await runTool(def, ctxFor(calls, permissions as unknown as UserPermission[]))
			// `search_arp` consulta `core.units` antes de sair para a API externa; todas as
			// outras batem no banco.
			expect(calls.length, `${def.name} não fez nenhuma query`).toBeGreaterThan(0)
		}
	})
})
