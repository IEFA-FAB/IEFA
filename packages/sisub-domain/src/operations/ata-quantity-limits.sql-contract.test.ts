/**
 * Contrato entre o anexo de quantitativos em TS e os DEFAULT/CHECK do banco.
 *
 * A margem padrão e o vocabulário do ciclo existem nos dois lados. Divergir a margem faz a
 * mesma ata mostrar uma máxima no wizard recém-aberto e outra depois do reload; divergir o
 * ciclo faz o toggle gravar um valor que o CHECK recusa — sem mensagem que diga qual.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_MAX_MARGIN_PERCENT, DELIVERY_CYCLES, MAX_MARGIN_PERCENT_LIMIT } from "./ata-quantity-limits.ts"

const SQL = readFileSync(
	join(import.meta.dir, "..", "..", "..", "database", "supabase", "migrations", "20260916134659_procurement_list_quantity_limits.sql"),
	"utf8"
).replace(/--[^\n]*/g, "")

/** Valores de um `check (... <coluna> in ('a', 'b'))`, um por ocorrência da coluna. */
function cycleCheckValues(column: string): string[][] {
	const pattern = new RegExp(`(?<![a-z_])${column}\\s+in\\s*\\(([^)]*)\\)`, "gi")
	return [...SQL.matchAll(pattern)].map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((v) => v[1]).sort())
}

describe("procurement_list", () => {
	test("margem padrão igual nos dois lados", () => {
		const match = /max_margin_percent\s+smallint\s+not\s+null\s+default\s+(\d+)/i.exec(SQL)
		expect(Number(match?.[1])).toBe(DEFAULT_MAX_MARGIN_PERCENT)
	})

	test("teto da margem igual ao CHECK", () => {
		expect(SQL).toContain(`max_margin_percent between 0 and ${MAX_MARGIN_PERCENT_LIMIT}`)
	})
})

describe("ciclo de entrega", () => {
	test("insumo e item da ata aceitam exatamente o vocabulário do domínio", () => {
		const expected = [...DELIVERY_CYCLES].sort()
		expect(cycleCheckValues("default_delivery_cycle")).toEqual([expected])
		expect(cycleCheckValues("delivery_cycle")).toEqual([expected])
	})
})
