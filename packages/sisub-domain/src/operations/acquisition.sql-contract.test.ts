/**
 * Vocabulário da contratação de origem: a lista do TypeScript é a do CHECK da migration REAL.
 * Mesmo motivo de `sql-vocabulary.contract.test.ts`: valor novo num lado só passa no formulário e
 * estoura no insert com `violates check constraint`.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ACQUISITION_INSTRUMENTS, ACQUISITION_KINDS, ARP_SOURCES, DIRECT_CONTRACT_VALUE_CLAUSES, SRP_ROLES } from "./acquisition.ts"
import { EMPENHO_TYPES } from "./empenho-conformity.ts"

const MIGRATIONS = join(import.meta.dir, "..", "..", "..", "database", "supabase", "migrations")
const ORIGIN = "20260926214000_acquisition_origin.sql"

function checkValues(file: string, column: string, occurrence = 0): string[] {
	const sql = readFileSync(join(MIGRATIONS, file), "utf8").replace(/--[^\n]*/g, "")
	const matches = [...sql.matchAll(new RegExp(`${column}\\s+in\\s*\\(([^)]*)\\)`, "gi"))]
	const match = matches[occurrence]
	if (!match) throw new Error(`CHECK de \`${column}\` (ocorrência ${occurrence}) não encontrado em ${file}`)
	return [...(match[1] as string).matchAll(/'([^']+)'/g)].map((value) => value[1] as string).sort()
}

describe("vocabulário da contratação de origem", () => {
	test("acquisition.kind", () => {
		expect(checkValues(ORIGIN, "kind")).toEqual([...ACQUISITION_KINDS].sort())
	})
	test("acquisition.srp_role", () => {
		expect(checkValues(ORIGIN, "srp_role")).toEqual([...SRP_ROLES].sort())
	})
	test("acquisition.instrument", () => {
		expect(checkValues(ORIGIN, "instrument")).toEqual([...ACQUISITION_INSTRUMENTS].sort())
	})
	test("direct_contract_limit.clause", () => {
		expect(checkValues(ORIGIN, "clause")).toEqual([...DIRECT_CONTRACT_VALUE_CLAUSES].sort())
	})
	test("procurement_arp.source e procurement_arp_item.source", () => {
		expect(checkValues(ORIGIN, "source", 0)).toEqual([...ARP_SOURCES].sort())
		expect(checkValues(ORIGIN, "source", 1)).toEqual([...ARP_SOURCES].sort())
	})
	test("empenho.tipo (20260731140000)", () => {
		expect(checkValues("20260731140000_finance_empenho_document.sql", "tipo")).toEqual([...EMPENHO_TYPES].sort())
	})
})

describe("limites semeados", () => {
	test("2026 pelo Decreto 12.807/2025", () => {
		const sql = readFileSync(join(MIGRATIONS, ORIGIN), "utf8")
		expect(sql).toContain("('I',  '2026-01-01', 130984.20, 'Decreto nº 12.807, de 29 de dezembro de 2025')")
		expect(sql).toContain("('II', '2026-01-01',  65492.11, 'Decreto nº 12.807, de 29 de dezembro de 2025')")
	})
})
