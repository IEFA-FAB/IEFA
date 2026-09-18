/**
 * Integração — o painel "A caminho" só consulta coluna que existe.
 *
 * Este teste não mede regra de negócio: ele mede que as SELEÇÕES do
 * `incoming.fn.ts` batem com o schema. É um teste chato de propósito, e ele
 * existe porque o modo de falhar aqui é silencioso e caro:
 *
 *  - o PostgREST devolve erro para coluna inexistente, e código que descarta o
 *    erro entrega lista VAZIA. O painel diz "nada a chegar" com três entregas
 *    atrasadas, e ninguém desconfia de uma tela que está calma;
 *  - valor fora do CHECK num `.in("status", [...])` não dá erro nenhum: filtra
 *    por um valor que nunca ocorre e devolve vazio. Foi assim que `review`, que
 *    não existe em `nfe_document.status`, quase entrou.
 *
 * Escrevi este arquivo depois de errar o nome de coluna três vezes na mesma
 * tarde — `empenho.valor_empenhado`, `goods_receipt_item.refusal_reason` e
 * `nfe_document.status = 'review'` — e nenhuma delas apareceu no typecheck,
 * porque as tabelas novas entram por cliente `any`.
 */
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

/** As mesmas listas de colunas do `incoming.fn.ts`, na mesma ordem. */
const SELECTIONS: Array<{ label: string; table: string; columns: string }> = [
	{ label: "OF a receber", table: "procurement.supply_order", columns: "id, empenho_id, number, sent_at, expected_delivery, status, notes" },
	{ label: "favorecido do empenho", table: "finance.empenho", columns: "id, numero_empenho, favorecido_nome, favorecido_cnpj, unit_id" },
	{ label: "saldo do empenho", table: "finance.v_empenho_saldo", columns: "empenho_id, saldo_a_liquidar" },
	{
		label: "recebimentos da cozinha",
		table: "inventory.goods_receipt",
		columns: "id, supply_order_id, status, nfe_document_id, source, delivery_note_number, created_at, definitive_at, kitchen_id",
	},
	{ label: "unidade compradora da cozinha", table: "kitchen.kitchen", columns: "unit_id, purchase_unit_id" },
	{
		label: "notas em aberto",
		table: "inventory.nfe_document",
		columns: "id, access_key, supplier_name, supplier_cnpj, supplier_cpf, issued_at, total_value, status, situation_result, kitchen_id, unit_id",
	},
	{ label: "itens da nota", table: "inventory.nfe_item", columns: "id, nfe_document_id, ingredient_item_id" },
]

/** Os valores usados em `.in("status", [...])`, que precisam existir no CHECK. */
const STATUS_FILTERS: Array<{ label: string; table: string; column: string; values: string[] }> = [
	{ label: "OF a receber", table: "procurement.supply_order", column: "status", values: ["sent", "partially_received"] },
	{
		label: "notas em aberto",
		table: "inventory.nfe_document",
		column: "status",
		values: ["announced", "imported", "available", "matched", "divergent"],
	},
	{ label: "recebimento recusado", table: "inventory.goods_receipt", column: "status", values: ["rejected", "provisional", "definitive", "draft"] },
	{ label: "situação da nota", table: "inventory.nfe_document", column: "situation_result", values: ["cancelled"] },
]

describeIf("incoming deliveries panel (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("toda coluna consultada pelo painel existe", async () => {
		for (const selection of SELECTIONS) {
			const [schema, table] = selection.table.split(".")
			const wanted = selection.columns.split(",").map((column) => column.trim())
			const rows = (await sql`
				select column_name from information_schema.columns
				 where table_schema = ${schema as string} and table_name = ${table as string}`) as unknown as Array<{ column_name: string }>
			const existing = new Set(rows.map((row) => row.column_name))
			// guarda contra tabela inexistente passar como verde: sem colunas, todo
			// nome estaria "faltando" e o erro seria confuso; sem esta linha, uma
			// consulta vazia por outro motivo passaria despercebida
			expect(existing.size, `${selection.table} não existe`).toBeGreaterThan(0)
			const missing = wanted.filter((column) => !existing.has(column))
			expect(missing, `${selection.label}: colunas inexistentes em ${selection.table}`).toEqual([])
		}
	})

	test("todo valor de status filtrado existe no CHECK da coluna", async () => {
		for (const filter of STATUS_FILTERS) {
			const [schema, table] = filter.table.split(".")
			const [row] = (await sql`
				select pg_get_constraintdef(c.oid) as definition
				  from pg_constraint c
				  join pg_class t on t.oid = c.conrelid
				  join pg_namespace n on n.oid = t.relnamespace
				 where n.nspname = ${schema as string} and t.relname = ${table as string}
				   and c.contype = 'c' and pg_get_constraintdef(c.oid) like ${`%${filter.column} = ANY%`}
				 limit 1`) as unknown as Array<{ definition: string }>
			expect(row?.definition, `${filter.table}.${filter.column} sem CHECK de lista`).toBeTruthy()
			const allowed = [...(row?.definition ?? "").matchAll(/'([a-z_]+)'::text/g)].map((match) => match[1])
			const unknown = filter.values.filter((value) => !allowed.includes(value))
			expect(unknown, `${filter.label}: valores fora do CHECK de ${filter.table}.${filter.column} (permitidos: ${allowed.join(", ")})`).toEqual([])
		}
	})
})
