/**
 * Contrato geral entre os vocabulários do banco e os do TypeScript.
 *
 * O repositório declara a mesma lista de valores em dois lugares: um
 * `check (coluna in (...))` na migration e uma constante `as const` no domínio.
 * Divergir é fácil e silencioso — o valor novo passa no formulário, o insert
 * estoura em runtime com `violates check constraint`, e a mensagem que chega ao
 * usuário não diz qual valor foi recusado.
 *
 * `conditioning.sql-contract.test.ts` fez isso para acondicionamento. Aqui a
 * checagem é geral: cada par é lido da migration REAL, não de uma cópia.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { MENU_ITEM_GROUPS } from "../schemas/common.ts"
import {
	EQUIPMENT_ISSUE_CATEGORIES,
	EQUIPMENT_ISSUE_SEVERITIES,
	EQUIPMENT_ISSUE_STATUSES,
	EQUIPMENT_ROLE_CATEGORIES,
	EQUIPMENT_UNIT_STATUSES,
	MAINTENANCE_KINDS,
} from "../schemas/equipment.ts"
import { WORKFORCE_NOTE_KINDS, WORKFORCE_SURVEY_STATUSES } from "../schemas/workforce.ts"
import { CATALOG_SCOPE_VALUES } from "./catalog-scope.ts"
import { GOODS_RECEIPT_STATUSES, STOCK_INFLOW_TYPES, STOCK_MOVEMENT_TYPES, STOCK_OUTFLOW_TYPES, SUPPLY_ORDER_STATUSES } from "./inventory-vocabulary.ts"

const MIGRATIONS = join(import.meta.dir, "..", "..", "..", "database", "supabase", "migrations")

/** Só o SQL executável — comentário explica decisão, e explicar não é declarar. */
function stripSqlComments(sql: string): string {
	return sql.replace(/--[^\n]*/g, "")
}

/**
 * Valores de `check (<coluna> in ('a','b',...))` numa migration.
 *
 * `occurrence` é obrigatório onde a mesma coluna aparece mais de uma vez no
 * arquivo — e isso é comum: em 20260729170000, `status[0]` é de
 * `procurement.supply_order` e `status[1]` é de `inventory.goods_receipt`.
 * Um índice errado compara vocabulários de tabelas diferentes e passa verde.
 */
function checkValues(file: string, column: string, occurrence = 0): string[] {
	const sql = stripSqlComments(readFileSync(join(MIGRATIONS, file), "utf8"))
	const matches = [...sql.matchAll(new RegExp(`${column}\\s+in\\s*\\(([^)]*)\\)`, "gi"))]
	const match = matches[occurrence]
	if (!match) throw new Error(`CHECK de \`${column}\` (ocorrência ${occurrence}) não encontrado em ${file} — ${matches.length} ocorrência(s)`)
	return [...match[1].matchAll(/'([^']+)'/g)].map((value) => value[1]).sort()
}

const EQUIPAMENTO = "20260825120000_kitchen_equipment.sql"
const CONDICAO = "20260827120000_kitchen_equipment_condition.sql"
const EFETIVO = "20260827163000_workforce_matrix.sql"
const ESTOQUE = "20260729160000_inventory_stock_core.sql"
const RECEBIMENTO = "20260729170000_procurement_supply_order_goods_receipt.sql"

const PARES: Array<{ nome: string; file: string; column: string; occurrence?: number; ts: readonly string[] }> = [
	{ nome: "equipment_role.category", file: EQUIPAMENTO, column: "category", ts: EQUIPMENT_ROLE_CATEGORIES },
	{ nome: "equipment_unit.status", file: EQUIPAMENTO, column: "status", ts: EQUIPMENT_UNIT_STATUSES },
	{ nome: "equipment_issue.severity", file: CONDICAO, column: "severity", ts: EQUIPMENT_ISSUE_SEVERITIES },
	{ nome: "equipment_issue.status", file: CONDICAO, column: "status", ts: EQUIPMENT_ISSUE_STATUSES },
	{ nome: "equipment_issue.category", file: CONDICAO, column: "category", ts: EQUIPMENT_ISSUE_CATEGORIES },
	{ nome: "equipment_maintenance_plan.kind", file: CONDICAO, column: "kind", ts: MAINTENANCE_KINDS },
	{ nome: "workforce_note.kind", file: EFETIVO, column: "kind", ts: WORKFORCE_NOTE_KINDS },
	{ nome: "workforce_survey.status", file: EFETIVO, column: "status", ts: WORKFORCE_SURVEY_STATUSES },
	{ nome: "stock_movement.type", file: ESTOQUE, column: "type", occurrence: 0, ts: STOCK_MOVEMENT_TYPES },
	{ nome: "supply_order.status", file: RECEBIMENTO, column: "status", occurrence: 0, ts: SUPPLY_ORDER_STATUSES },
	{ nome: "goods_receipt.status", file: RECEBIMENTO, column: "status", occurrence: 1, ts: GOODS_RECEIPT_STATUSES },
]

describe("vocabulário SQL × TypeScript", () => {
	for (const par of PARES) {
		test(par.nome, () => {
			expect(checkValues(par.file, par.column, par.occurrence)).toEqual([...par.ts].sort())
		})
	}
})

describe("catalog_scope", () => {
	test("kitchen.folder aceita exatamente os escopos do domínio", () => {
		expect(checkValues("20260818120000_folder_catalog_scope.sql", "catalog_scope")).toEqual([...CATALOG_SCOPE_VALUES].sort())
	})

	test("core.item aceita os escopos do domínio MAIS 'permanente'", () => {
		// A diferença é deliberada e precisa continuar visível: 'permanente' é para
		// material permanente, que não é insumo e não aparece nas abas do catálogo
		// de alimentação. Se alguém igualar as duas listas, um dos dois lados fica
		// errado — e o teste diz qual.
		expect(checkValues("20260901120000_core_item_nucleus.sql", "catalog_scope")).toEqual([...CATALOG_SCOPE_VALUES, "permanente"].sort())
	})
})

describe("menu_items.item_group", () => {
	test("os grupos do cardápio do banco e do domínio são os mesmos", () => {
		expect(checkValues("20260706200000_menu_item_group_order_proportion.sql", "item_group")).toEqual([...MENU_ITEM_GROUPS].sort())
	})
})

describe("particionamento dos tipos de movimento no custeio", () => {
	// As triggers de custo médio classificam cada tipo em ENTRADA ou SAÍDA por
	// listas literais no SQL. Tipo novo que não entre em nenhuma das duas passa
	// pelo ledger sem afetar `inventory.stock_cost`: o saldo anda, o custo médio
	// não. É o tipo de erro que só aparece no balancete do mês seguinte.
	test("entradas ∪ saídas cobrem exatamente o vocabulário de stock_movement.type", () => {
		const todos = checkValues(ESTOQUE, "type", 0)
		const saidas = checkValues(ESTOQUE, "type", 1)
		const entradas = checkValues(ESTOQUE, "type", 2)
		expect([...saidas, ...entradas].sort()).toEqual(todos)
	})

	test("nenhum tipo é entrada e saída ao mesmo tempo", () => {
		const saidas = new Set(checkValues(ESTOQUE, "type", 1))
		expect(checkValues(ESTOQUE, "type", 2).filter((tipo) => saidas.has(tipo))).toEqual([])
	})

	test("as constantes do domínio espelham a mesma partição", () => {
		expect([...STOCK_INFLOW_TYPES, ...STOCK_OUTFLOW_TYPES].sort()).toEqual([...STOCK_MOVEMENT_TYPES].sort())
	})
})
