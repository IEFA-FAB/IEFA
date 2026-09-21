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
import { readdirSync, readFileSync } from "node:fs"
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
import { CONSERVATION_CLASSES } from "./conditioning.ts"
import {
	EXPIRY_DEFAULT_ALERT_DAYS,
	GOODS_RECEIPT_STATUSES,
	INFLOW_REASONS,
	LOT_DERIVATIONS,
	OPENING_BALANCE_SOURCES,
	OPENING_BALANCE_STATUSES,
	OPENING_COST_SOURCES,
	OUTFLOW_REASONS,
	SEGREGATION_MODES,
	STOCK_ADJUSTMENT_REASONS,
	STOCK_ADJUSTMENT_STATUSES,
	STOCK_INFLOW_TYPES,
	STOCK_MOVEMENT_REASONS,
	STOCK_MOVEMENT_TYPES,
	STOCK_OUTFLOW_TYPES,
	SUPPLY_ORDER_STATUSES,
} from "./inventory-vocabulary.ts"

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

/**
 * Migrations em ordem de aplicação. O contrato precisa comparar o TypeScript
 * com a definição VIGENTE, não com a primeira: `stock_movement.type` já foi
 * redefinido (`drop constraint` + `add constraint`) e as triggers de custo já
 * foram substituídas por `create or replace`. Um teste apontado para o arquivo
 * original passa a validar um vocabulário revogado — e continua verde.
 */
function migrationsInOrder(): string[] {
	return readdirSync(MIGRATIONS)
		.filter((name) => name.endsWith(".sql"))
		.sort()
}

/** Conteúdo (sem comentário) da ÚLTIMA migration que casa com o padrão. */
function latestSqlWith(pattern: RegExp): { file: string; sql: string } {
	let found: { file: string; sql: string } | null = null
	for (const file of migrationsInOrder()) {
		const sql = stripSqlComments(readFileSync(join(MIGRATIONS, file), "utf8"))
		if (pattern.test(sql)) found = { file, sql }
	}
	if (!found) throw new Error(`nenhuma migration casa com ${pattern}`)
	return found
}

/** Valores de um `... in ('a','b')` dentro de um trecho de SQL. */
function valuesIn(sql: string, column: string, occurrence = 0): string[] {
	const matches = [...sql.matchAll(new RegExp(`${column}\\s+in\\s*\\(([^)]*)\\)`, "gi"))]
	const match = matches[occurrence]
	if (!match) throw new Error(`\`${column}\` (ocorrência ${occurrence}) não encontrado — ${matches.length} ocorrência(s)`)
	return [...match[1].matchAll(/'([^']+)'/g)].map((value) => value[1]).sort()
}

/** Corpo da definição vigente de uma função do schema `inventory`. */
function latestFunctionBody(name: string): string {
	const { sql } = latestSqlWith(new RegExp(`function\\s+inventory\\.${name}\\b`, "i"))
	const start = sql.search(new RegExp(`function\\s+inventory\\.${name}\\b`, "i"))
	// da assinatura até o fim do corpo: `$$;` ou `$function$;`
	const rest = sql.slice(start)
	const end = rest.search(/\$(?:function)?\$\s*;/)
	return end === -1 ? rest : rest.slice(0, end)
}

/**
 * Vocabulário VIGENTE de `stock_movement.type` — lido do `add constraint`
 * nomeado, não da posição da lista no arquivo: as migrations de função repetem
 * `type in (...)` várias vezes, e contar ocorrências quebraria a cada nova.
 */
function currentMovementTypes(): string[] {
	const { sql } = latestSqlWith(/constraint stock_movement_type_check check \(type in \(/i)
	const match = sql.match(/constraint stock_movement_type_check check \(type in \(([^)]*)\)/i)
	if (!match) throw new Error("CHECK nomeado de stock_movement.type não encontrado")
	return [...(match[1] as string).matchAll(/'([^']+)'/g)].map((value) => value[1] as string).sort()
}

const EQUIPAMENTO = "20260825120000_kitchen_equipment.sql"
const CONDICAO = "20260827120000_kitchen_equipment_condition.sql"
const EFETIVO = "20260827163000_workforce_matrix.sql"
const RECEBIMENTO = "20260729170000_procurement_supply_order_goods_receipt.sql"
const ABERTURA = "20260922100000_inventory_opening_balance.sql"

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
	{ nome: "supply_order.status", file: RECEBIMENTO, column: "status", occurrence: 0, ts: SUPPLY_ORDER_STATUSES },
	{ nome: "goods_receipt.status", file: RECEBIMENTO, column: "status", occurrence: 1, ts: GOODS_RECEIPT_STATUSES },
	{ nome: "opening_balance.status", file: ABERTURA, column: "status", occurrence: 0, ts: OPENING_BALANCE_STATUSES },
	{ nome: "opening_balance.source", file: ABERTURA, column: "source", occurrence: 0, ts: OPENING_BALANCE_SOURCES },
	{ nome: "opening_balance_item.cost_source", file: ABERTURA, column: "cost_source", occurrence: 0, ts: OPENING_COST_SOURCES },
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
	//
	// As listas são lidas da definição VIGENTE de cada função, não do arquivo
	// que a criou: as duas já foram substituídas por `create or replace`.
	const saidasDoBefore = valuesIn(latestFunctionBody("stock_movement_costing_before"), "type", 0)
	const entradasDoAfter = valuesIn(latestFunctionBody("stock_movement_costing_after"), "type", 0)
	const todos = currentMovementTypes()

	test("o vocabulário vigente do banco é o do domínio", () => {
		expect(todos).toEqual([...STOCK_MOVEMENT_TYPES].sort())
	})

	test("entradas ∪ saídas cobrem exatamente o vocabulário de stock_movement.type", () => {
		expect([...saidasDoBefore, ...entradasDoAfter].sort()).toEqual(todos)
	})

	test("nenhum tipo é entrada e saída ao mesmo tempo", () => {
		const saidas = new Set(saidasDoBefore)
		expect(entradasDoAfter.filter((tipo) => saidas.has(tipo))).toEqual([])
	})

	test("a lista de entradas do domínio é a MESMA que a trigger AFTER usa", () => {
		// `stock-reports.fn.ts` decide entrada/saída em TypeScript. Divergir da
		// trigger faz o relatório contar o oposto do que o ledger contabilizou.
		expect(entradasDoAfter).toEqual([...STOCK_INFLOW_TYPES].sort())
	})

	test("a lista de saídas do domínio é a MESMA que a trigger BEFORE usa", () => {
		expect(saidasDoBefore).toEqual([...STOCK_OUTFLOW_TYPES].sort())
	})

	test("as constantes do domínio espelham a mesma partição", () => {
		expect([...STOCK_INFLOW_TYPES, ...STOCK_OUTFLOW_TYPES].sort()).toEqual([...STOCK_MOVEMENT_TYPES].sort())
	})

	test("a view de saldo e o fechamento mensal usam a MESMA lista de entradas", () => {
		// A view soma `case when type in (...) then +q else -q`, e o fechamento
		// repete a lista quatro vezes. Uma lista defasada faz a devolução de
		// saída entrar no balancete como saída — e o RMA fecha errado.
		const saldo = latestSqlWith(/create or replace view inventory\.v_stock_balance|create view inventory\.v_stock_balance/i)
		expect(valuesIn(saldo.sql, "m\\.type", 0)).toEqual([...STOCK_INFLOW_TYPES].sort())

		const fechamento = latestFunctionBody("close_month")
		for (const occurrence of [0, 1, 2, 3]) {
			expect(valuesIn(fechamento, "type", occurrence)).toEqual([...STOCK_INFLOW_TYPES].sort())
		}
	})
})

describe("motivos de ajuste", () => {
	const REASONS = "20260917160000_inventory_operable_core.sql"

	test("stock_movement.reason_code aceita exatamente os motivos do domínio", () => {
		expect(checkValues(REASONS, "reason_code", 0)).toEqual([...STOCK_MOVEMENT_REASONS].sort())
	})

	test("stock_adjustment_item.reason_code aceita os motivos de ajuste (sem o descarte de sobra)", () => {
		// ocorrência 3: 0 = coluna de stock_movement · 1 e 2 = CHECK de direção ·
		// 3 = coluna de stock_adjustment_item
		expect(checkValues(REASONS, "reason_code", 3)).toEqual([...STOCK_ADJUSTMENT_REASONS].sort())
	})

	test("entrada ∪ saída cobrem os motivos de ajuste, sem interseção", () => {
		expect([...INFLOW_REASONS, ...OUTFLOW_REASONS].sort()).toEqual([...STOCK_ADJUSTMENT_REASONS].sort())
		const entradas = new Set<string>(INFLOW_REASONS)
		expect(OUTFLOW_REASONS.filter((reason) => entradas.has(reason))).toEqual([])
	})

	test("stock_adjustment.status espelha o domínio", () => {
		expect(checkValues(REASONS, "status", 0)).toEqual([...STOCK_ADJUSTMENT_STATUSES].sort())
	})

	test("segregação e derivação de lote espelham o domínio", () => {
		expect(checkValues(REASONS, "segregation")).toEqual([...SEGREGATION_MODES].sort())
		expect(checkValues(REASONS, "derivation", 0)).toEqual([...LOT_DERIVATIONS].sort())
	})
})

describe("antecedência default do alerta de vencimento", () => {
	const EXPIRY = "20260919120000_expiry_alert_policy.sql"

	/**
	 * O default vive num `case` dentro de `inventory.expiry_alert_days`, e não
	 * num `check`: `checkValues` não o alcança. A leitura aqui é do `case` real
	 * do arquivo — se alguém trocar 3 por 5 no SQL e esquecer a tela, o teste
	 * acusa; ninguém acusaria contando os dias na prateleira.
	 */
	function caseDefaults(): Record<string, number> {
		const sql = stripSqlComments(readFileSync(join(MIGRATIONS, EXPIRY), "utf8"))
		const block = sql.match(/case p_conservation_class([\s\S]*?)end/)
		if (!block) throw new Error("case de default não encontrado na migration de vencimentos")
		const found: Record<string, number> = {}
		for (const [, klass, days] of block[1].matchAll(/when\s+'([a-z_]+)'\s+then\s+(\d+)/g)) {
			found[klass] = Number(days)
		}
		const fallback = block[1].match(/else\s+(\d+)/)
		if (fallback) found.outras = Number(fallback[1])
		return found
	}

	test("o `case` da migration espelha EXPIRY_DEFAULT_ALERT_DAYS", () => {
		expect(caseDefaults()).toEqual({ ...EXPIRY_DEFAULT_ALERT_DAYS })
	})

	test("as classes com default próprio são classes de conservação existentes", () => {
		const classes = Object.keys(EXPIRY_DEFAULT_ALERT_DAYS).filter((key) => key !== "outras")
		expect(classes.every((klass) => (CONSERVATION_CLASSES as readonly string[]).includes(klass))).toBe(true)
	})
})
