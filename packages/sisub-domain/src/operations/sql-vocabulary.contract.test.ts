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
	MAINTENANCE_LOG_KINDS,
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
	{ nome: "equipment_maintenance_plan.kind", file: CONDICAO, column: "kind", occurrence: 0, ts: MAINTENANCE_KINDS },
	// O log aceita `corrective` além dos planejáveis: manutenção corretiva se
	// registra, não se planeja. Listas diferentes de propósito — e por isso os
	// dois pares precisam existir.
	{ nome: "equipment_maintenance_log.kind", file: CONDICAO, column: "kind", occurrence: 1, ts: MAINTENANCE_LOG_KINDS },
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

describe("item_group", () => {
	// A migration declara o MESMO vocabulário em duas tabelas: menu_template_items
	// (ocorrência 0) e menu_items (ocorrência 1). Verificar só a primeira deixaria
	// o cardápio publicado sem contrato — que é justamente onde o valor chega ao
	// usuário.
	const GRUPOS = "20260706200000_menu_item_group_order_proportion.sql"

	test("kitchen.menu_template_items", () => {
		expect(checkValues(GRUPOS, "item_group", 0)).toEqual([...MENU_ITEM_GROUPS].sort())
	})

	test("kitchen.menu_items", () => {
		expect(checkValues(GRUPOS, "item_group", 1)).toEqual([...MENU_ITEM_GROUPS].sort())
	})
})

describe("particionamento dos tipos de movimento no custeio", () => {
	// As duas triggers de custo médio listam tipos literalmente, e de formas
	// ASSIMÉTRICAS — é daí que vem o risco:
	//
	//   • AFTER (`stock_movement_costing_after`) enumera as ENTRADAS e trata
	//     todo o resto no `else`. Tipo novo fora da lista NÃO é ignorado: vira
	//     SAÍDA por omissão e subtrai do saldo.
	//   • BEFORE (`stock_movement_costing_before`) enumera as SAÍDAS, e é essa
	//     lista que faz a saída herdar o custo médio vigente quando `unit_cost`
	//     vem nulo. Saída fora dela entra com custo nulo → `total_cost` zero →
	//     a quantidade cai sem valor sair, e o custo médio do que ficou infla.
	//
	// Somando os dois: um tipo esquecido nas duas listas subtrai saldo a custo
	// zero. Não é o balancete que denuncia — é o inventário não fechar meses
	// depois. Por isso a exigência é de PARTIÇÃO: união completa e interseção
	// vazia, que é o mesmo que dizer que a lista do BEFORE é exatamente o
	// complemento da lista do AFTER.
	// occurrence 0 = CHECK de stock_movement.type · 1 = lista de saídas do BEFORE ·
	// 2 = lista de entradas do AFTER.
	const SAIDAS_DO_BEFORE = 1
	const ENTRADAS_DO_AFTER = 2

	test("entradas ∪ saídas cobrem exatamente o vocabulário de stock_movement.type", () => {
		const todos = checkValues(ESTOQUE, "type", 0)
		const saidas = checkValues(ESTOQUE, "type", SAIDAS_DO_BEFORE)
		const entradas = checkValues(ESTOQUE, "type", ENTRADAS_DO_AFTER)
		expect([...saidas, ...entradas].sort()).toEqual(todos)
	})

	test("nenhum tipo é entrada e saída ao mesmo tempo", () => {
		const saidas = new Set(checkValues(ESTOQUE, "type", SAIDAS_DO_BEFORE))
		expect(checkValues(ESTOQUE, "type", ENTRADAS_DO_AFTER).filter((tipo) => saidas.has(tipo))).toEqual([])
	})

	test("a lista de entradas do domínio é a MESMA que a trigger AFTER usa", () => {
		// `stock-reports.fn.ts` decide entrada/saída em TypeScript. Divergir da
		// trigger faz o relatório contar o oposto do que o ledger contabilizou.
		expect(checkValues(ESTOQUE, "type", ENTRADAS_DO_AFTER)).toEqual([...STOCK_INFLOW_TYPES].sort())
	})

	test("as constantes do domínio espelham a mesma partição", () => {
		expect([...STOCK_INFLOW_TYPES, ...STOCK_OUTFLOW_TYPES].sort()).toEqual([...STOCK_MOVEMENT_TYPES].sort())
	})
})
