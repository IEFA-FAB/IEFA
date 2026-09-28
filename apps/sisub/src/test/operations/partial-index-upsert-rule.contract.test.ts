/**
 * Guard de DEFASAGEM da regra `postgrest-upsert-on-partial-unique-index`
 * (`.opengrep/rules/postgrest-partial-index-upsert.yaml`).
 *
 * A regra acusa `upsert(..., { onConflict })` do PostgREST contra índice único PARCIAL (o
 * PostgREST não manda o `where` do índice e o Postgres responde 42P10 em toda gravação). Ela
 * não lê o banco: lista, bloco a bloco, o par (tabela, colunas) de cada índice parcial. Índice
 * parcial novo que não entra na lista é upsert quebrado que o `scan:rules` deixa passar.
 *
 * Este teste lê `pg_index` do banco vivo e exige que cada índice único parcial sem expressão e
 * sem gêmeo total nas mesmas colunas esteja coberto por algum bloco da regra. Bloco que não
 * corresponde mais a índice nenhum só é avisado: não quebra nada, só acusa à toa.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const RULE_FILE = join(__dirname, "..", "..", "..", "..", "..", ".opengrep", "rules", "postgrest-partial-index-upsert.yaml")

type RuleBlock = { table: RegExp; columns: RegExp }

/** Pares (tabela, colunas) da regra, na ordem dos blocos. */
function readRuleBlocks(): RuleBlock[] {
	const lines = readFileSync(RULE_FILE, "utf8").split("\n")
	const blocks: RuleBlock[] = []
	let table: RegExp | null = null
	for (let i = 0; i < lines.length; i++) {
		const metavariable = /^\s*metavariable: \$(T|COLS)\s*$/.exec(lines[i] as string)?.[1]
		if (!metavariable) continue
		const regex = /^\s*regex: (.+)$/.exec(lines[i + 1] ?? "")?.[1]
		if (!regex) throw new Error(`metavariable-regex sem regex na linha ${i + 2} da regra`)
		if (metavariable === "T") {
			table = new RegExp(regex)
		} else {
			if (!table) throw new Error(`regex de $COLS sem $T antes, na linha ${i + 2} da regra`)
			blocks.push({ table, columns: new RegExp(regex) })
			table = null
		}
	}
	return blocks
}

const isCovered = (blocks: RuleBlock[], table: string, columns: string) => blocks.some((b) => b.table.test(`"${table}"`) && b.columns.test(`"${columns}"`))

describe("regra postgrest-upsert-on-partial-unique-index: leitura dos blocos", () => {
	test("todo bloco tem o par (tabela, colunas) e casa o índice que originou a regra", () => {
		const blocks = readRuleBlocks()
		expect(blocks.length).toBeGreaterThan(0)
		expect(isCovered(blocks, "price_research", "idempotency_key")).toBe(true)
		// Ordem das colunas não importa, nem para o Postgres nem para a regra.
		expect(isCovered(blocks, "daily_menu", "service_date,meal_type_id,kitchen_id")).toBe(true)
		expect(isCovered(blocks, "daily_menu", "kitchen_id,meal_type_id,service_date")).toBe(true)
		// Coluna igual em tabela sem índice parcial nela não é o defeito.
		expect(isCovered(blocks, "gtin", "gtin")).toBe(false)
	})
})

const PLATFORM_SCHEMAS = [
	"pg_catalog",
	"information_schema",
	"pg_toast",
	"auth",
	"storage",
	"realtime",
	"_realtime",
	"vault",
	"extensions",
	"graphql",
	"graphql_public",
	"pgsodium",
	"net",
	"cron",
	"supabase_functions",
	"supabase_migrations",
	"pgbouncer",
]

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describe.skip

describeIf("regra postgrest-upsert-on-partial-unique-index × pg_index", () => {
	let sql: postgres.Sql
	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})
	afterAll(async () => {
		await sql?.end()
	})

	test("todo índice único parcial sem gêmeo total está na regra", async () => {
		// Schemas do Postgres e do Supabase ficam fora: nenhum app escreve neles pelo PostgREST
		// (`auth.users`, `storage.objects` e `vault.secrets` têm índices parciais próprios).
		const rows = await sql<{ sch: string; tbl: string; cols: string; iname: string }[]>`
			with idx as (
				select n.nspname sch, c.relname tbl, i.indexrelid::regclass::text iname,
					i.indpred is not null partial, i.indexprs is not null expr,
					(select string_agg(a.attname, ',' order by a.attname) from unnest(i.indkey) k
						join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k) cols
				from pg_index i
				join pg_class c on c.oid = i.indrelid
				join pg_namespace n on n.oid = c.relnamespace
				where i.indisunique and n.nspname::text <> all(${sql.array(PLATFORM_SCHEMAS)})
			)
			select sch, tbl, cols, iname from idx p
			where partial and not expr
				and not exists (select 1 from idx t where t.sch = p.sch and t.tbl = p.tbl and t.cols = p.cols and not t.partial)
			order by sch, tbl, iname`

		const blocks = readRuleBlocks()
		const missing = rows.filter((r) => !isCovered(blocks, r.tbl, r.cols)).map((r) => `${r.iname} (${r.sch}.${r.tbl}: ${r.cols})`)
		expect(missing, "índice único parcial fora da regra: acrescente o bloco (tabela, colunas) em .opengrep/rules/postgrest-partial-index-upsert.yaml").toEqual(
			[]
		)

		const stale = blocks.filter((b) => !rows.some((r) => b.table.test(`"${r.tbl}"`) && b.columns.test(`"${r.cols}"`)))
		if (stale.length > 0) {
			console.warn(
				`[partial-index-upsert-rule] blocos sem índice parcial correspondente no banco: ${stale.map((b) => `${b.table.source} × ${b.columns.source}`).join("; ")}`
			)
		}
	})
})
