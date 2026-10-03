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
 *
 * Índice de migration ALHEIA não reprova. O banco é compartilhado e a migration de um PR é
 * aplicada antes do merge dele; reprovar por ela derrubava o gate de todo PR aberto até a
 * `main` ganhar o bloco (13 de 17 falhas do gate entre 26/09 e 02/10, sete PRs de uma vez em
 * 01/10). "Alheia" é exato: versão registrada em `supabase_migrations.schema_migrations` que
 * não existe nesta árvore, com um `create unique index` que cita a tabela. Vale para índice
 * sem nome, nome truncado em 63 bytes e índice recriado. Índice criado fora de migration
 * (editor SQL, hotfix) e índice das migrations desta árvore continuam reprovando.
 */

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const RULE_FILE = join(__dirname, "..", "..", "..", "..", "..", ".opengrep", "rules", "postgrest-partial-index-upsert.yaml")
const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "..", "..", "packages", "database", "supabase", "migrations")

/** Versões (`20261001170000`) das migrations desta árvore. */
function readTreeVersions(): Set<string> {
	return new Set(
		readdirSync(MIGRATIONS_DIR)
			.filter((file) => file.endsWith(".sql"))
			.map((file) => file.split("_")[0] as string)
	)
}

type AppliedMigration = { version: string; statements: string[] | null }
type UncoveredIndex = { sch: string; tbl: string; iname: string }

/**
 * Separa o índice fora da regra em `foreign` (criado por migration aplicada que esta árvore não
 * tem: é de outro PR) e `missing` (desta árvore, ou criado fora de migration: reprova).
 */
function partitionUncovered(
	uncovered: readonly UncoveredIndex[],
	applied: readonly AppliedMigration[],
	treeVersions: ReadonlySet<string>
): { foreign: UncoveredIndex[]; missing: UncoveredIndex[] } {
	const foreignIndexStatements = applied
		.filter((migration) => !treeVersions.has(migration.version))
		.flatMap((migration) => migration.statements ?? [])
		.map((statement) => statement.toLowerCase())
		.filter((statement) => /create\s+unique\s+index/.test(statement))
	const foreign: UncoveredIndex[] = []
	const missing: UncoveredIndex[] = []
	for (const index of uncovered) {
		// Pela tabela do `ON [schema.]tabela`, e não pelo nome do índice, que pode ser gerado pelo
		// Postgres ou truncado em 63 bytes. Nome de tabela do catálogo: [a-z0-9_$].
		const table = new RegExp(`\\bon\\s+(?:only\\s+)?(?:"?[\\w$]+"?\\.)?"?${index.tbl.toLowerCase().replaceAll("$", "\\$")}"?(?![\\w$])`)
		if (foreignIndexStatements.some((statement) => table.test(statement))) foreign.push(index)
		else missing.push(index)
	}
	return { foreign, missing }
}

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

describe("índice de migration alheia x desta árvore", () => {
	const index = (tbl: string, iname = `${tbl}_idx`) => ({ sch: "kitchen", tbl, iname })
	const otherPr = { version: "20991231000000", statements: ["CREATE UNIQUE INDEX ON kitchen.foo (bar) WHERE deleted_at IS NULL"] }

	test("migration aplicada que a árvore não tem desculpa o índice da tabela dela, com ou sem nome", () => {
		const out = partitionUncovered([index("foo", "foo_bar_idx")], [otherPr], new Set())
		expect(out.foreign.map((i) => i.tbl)).toEqual(["foo"])
		expect(out.missing).toEqual([])
	})

	test("a mesma migration já nesta árvore: reprova", () => {
		const out = partitionUncovered([index("foo")], [otherPr], new Set(["20991231000000"]))
		expect(out.missing.map((i) => i.tbl)).toEqual(["foo"])
	})

	test("índice criado fora de migration (editor SQL, hotfix): reprova", () => {
		expect(partitionUncovered([index("bar")], [otherPr], new Set()).missing.map((i) => i.tbl)).toEqual(["bar"])
	})

	test("tabela citada só como prefixo de outra não conta", () => {
		expect(partitionUncovered([index("fo")], [otherPr], new Set()).missing.map((i) => i.tbl)).toEqual(["fo"])
	})

	test("as versões desta árvore são lidas (proteção contra teste que passa vazio)", () => {
		expect(readTreeVersions().size).toBeGreaterThan(100)
	})
})

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
				where i.indisunique and n.nspname::text <> all(${PLATFORM_SCHEMAS}::text[])
			)
			select sch, tbl, cols, iname from idx p
			where partial and not expr
				and not exists (select 1 from idx t where t.sch = p.sch and t.tbl = p.tbl and t.cols = p.cols and not t.partial)
			order by sch, tbl, iname`

		const blocks = readRuleBlocks()
		const applied = await sql<AppliedMigration[]>`select version, statements from supabase_migrations.schema_migrations`
		const { foreign, missing: uncoveredHere } = partitionUncovered(
			rows.filter((r) => !isCovered(blocks, r.tbl, r.cols)),
			applied,
			readTreeVersions()
		)
		if (foreign.length > 0) {
			console.warn(
				`[partial-index-upsert-rule] índice parcial fora da regra, de migration aplicada que esta árvore não tem (outro PR): ${foreign.map((r) => r.iname).join(", ")}`
			)
		}
		const missing = uncoveredHere.map((r) => `${r.iname} (${r.sch}.${r.tbl})`)
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
