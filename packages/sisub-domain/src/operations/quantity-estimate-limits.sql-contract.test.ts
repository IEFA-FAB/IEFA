/**
 * Contrato entre o anexo de quantitativos em TS e os DEFAULT/CHECK do banco.
 *
 * O acréscimo padrão e o vocabulário do ciclo existem nos dois lados. Divergir o acréscimo faz
 * o mesmo anexo mostrar uma máxima no wizard recém-aberto e outra depois do reload; divergir o
 * ciclo faz o toggle gravar um valor que o CHECK recusa — sem mensagem que diga qual.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_MAX_INCREASE_PERCENT, DELIVERY_CYCLES, MAX_INCREASE_PERCENT_LIMIT } from "./quantity-estimate-limits.ts"

const SQL = readFileSync(
	join(import.meta.dir, "..", "..", "..", "database", "supabase", "migrations", "20260916134659_procurement_list_quantity_limits.sql"),
	"utf8"
).replace(/--[^\n]*/g, "")

/** Valores de um `check (... <coluna> in ('a', 'b'))`, um por ocorrência da coluna. */
function cycleCheckValues(column: string): string[][] {
	const pattern = new RegExp(`(?<![a-z_])${column}\\s+in\\s*\\(([^)]*)\\)`, "gi")
	return [...SQL.matchAll(pattern)].map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((v) => v[1]).sort())
}

describe("quantity_estimate", () => {
	test("acréscimo padrão igual nos dois lados", () => {
		const match = /max_margin_percent\s+smallint\s+not\s+null\s+default\s+(\d+)/i.exec(SQL)
		expect(Number(match?.[1])).toBe(DEFAULT_MAX_INCREASE_PERCENT)
	})

	// A migration que criou a coluna é histórica e usa o nome dela na época (`max_margin_percent`,
	// renomeada para `max_increase_percent` em 20260927040000); o rename não muda default nem CHECK.
	test("teto do acréscimo igual ao CHECK", () => {
		expect(SQL).toContain(`max_margin_percent between 0 and ${MAX_INCREASE_PERCENT_LIMIT}`)
	})
})

describe("ciclo de entrega", () => {
	test("insumo e item do anexo aceitam exatamente o vocabulário do domínio", () => {
		const expected = [...DELIVERY_CYCLES].sort()
		expect(cycleCheckValues("default_delivery_cycle")).toEqual([expected])
		expect(cycleCheckValues("delivery_cycle")).toEqual([expected])
	})
})
