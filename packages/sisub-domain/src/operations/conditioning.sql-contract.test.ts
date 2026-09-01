/**
 * Contrato entre o vocabulário TS e os CHECK do banco.
 *
 * `conditioning.ts` e as migrations declaram as mesmas listas em dois lugares.
 * Divergir é fácil e silencioso: o valor novo passa no formulário, o insert
 * estoura em runtime com `violates check constraint`, e a mensagem que o
 * usuário vê não diz qual valor foi recusado. Este teste falha no CI antes
 * disso.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CONSERVATION_CLASSES, PACKAGE_TYPES, TRANSPORT_REQUIREMENTS } from "./conditioning.ts"

const MIGRATIONS = join(import.meta.dir, "..", "..", "..", "database", "supabase", "migrations")

function migration(file: string): string {
	return readFileSync(join(MIGRATIONS, file), "utf8")
}

/** Valores de um `check (<coluna> in ('a', 'b', ...))`, na ordem em que aparecem. */
function checkValues(sql: string, column: string): string[] {
	const pattern = new RegExp(`${column}\\s+in\\s*\\(([^)]*)\\)`, "i")
	const match = pattern.exec(sql)
	if (!match) throw new Error(`CHECK de \`${column}\` não encontrado na migration`)
	return [...match[1].matchAll(/'([^']+)'/g)].map((value) => value[1])
}

/** Só o SQL executável — comentário é onde as decisões são explicadas, e explicar não é aplicar. */
function stripSqlComments(sql: string): string {
	return sql.replace(/--[^\n]*/g, "")
}

const CONDITIONING = migration("20260901120100_purchase_item_conditioning.sql")
const LOTS = migration("20260901120200_goods_receipt_lots.sql")

describe("purchase_item", () => {
	test("conservation_class: TS e SQL declaram exatamente o mesmo conjunto", () => {
		expect(checkValues(CONDITIONING, "conservation_class").sort()).toEqual([...CONSERVATION_CLASSES].sort())
	})

	test("package_type: TS e SQL declaram exatamente o mesmo conjunto", () => {
		expect(checkValues(CONDITIONING, "package_type").sort()).toEqual([...PACKAGE_TYPES].sort())
	})

	test("transport_requirement: TS e SQL declaram exatamente o mesmo conjunto", () => {
		expect(checkValues(CONDITIONING, "transport_requirement").sort()).toEqual([...TRANSPORT_REQUIREMENTS].sort())
	})
})

describe("stock_lot", () => {
	test("a classe copiada para o lote aceita as mesmas classes da compra", () => {
		// O lote recebe a classe vigente na especificação no recebimento. Um
		// conjunto menor aqui faria a efetivação falhar só para a classe que
		// ninguém usou ainda em teste.
		expect(checkValues(LOTS, "conservation_class").sort()).toEqual([...CONSERVATION_CLASSES].sort())
	})
})

describe("migrations", () => {
	test("o backfill do CATMAT não classifica 'in natura'", () => {
		// Regressão de decisão, não de código: in natura fala de processamento,
		// não de temperatura. Se alguém acrescentar essa regra, 295 itens ganham
		// classe errada com cara de conferida. O comentário da migration EXPLICA
		// a exclusão, então a checagem é sobre o SQL executável, não sobre o texto.
		const statements = stripSqlComments(CONDITIONING.slice(CONDITIONING.indexOf("Backfill conservador")))
		expect(statements).not.toMatch(/in\s+natura/i)
	})

	test("delivery_conditioning não é removido pelo acondicionamento estruturado", () => {
		// As 6 linhas preenchidas são o dado que motivou a estrutura; apagá-las
		// destruiria a evidência do backfill.
		expect(CONDITIONING).not.toMatch(/drop\s+column\s+delivery_conditioning/i)
	})
})
