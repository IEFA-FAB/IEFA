/**
 * Guard de DEFASAGEM dos tipos do banco: `generated.ts` (Supabase) e `drizzle/schema.ts`.
 *
 * ## O defeito que este teste existe para pegar
 *
 * Em 2026-09-26 os dois arquivos estavam meses atrás do banco: faltavam tabelas inteiras
 * (contagem de inventário, saldo de abertura, ordens de fornecimento, liquidação…), e o
 * schema Drizzle tinha sido remendado à mão até ninguém conseguir regerá-lo — um pull cru
 * apagava as tabelas de referência nutricional e não compilava. O código contornava com
 * cliente sem tipo, e aí o typecheck não enxerga nome de tabela nem de coluna.
 *
 * ## O que ele cobra
 *
 * **Tipo não pode apontar para o que o banco não tem.** Tabela ou coluna nos tipos que não
 * existe no `information_schema` é erro em runtime esperando acontecer — reprova.
 *
 * O contrário (banco com coisa que os tipos ainda não têm) só é AVISADO: a regra do repo é
 * aplicar a migration antes do merge, e nessa janela todo PR baseado na `main` veria o banco
 * à frente dos tipos. O remédio é o PR da migration regerar os dois arquivos
 * (`bun --filter @iefa/database db:types` e `db:drizzle:pull`), como está em
 * `.claude/rules/database.md`.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describe.skip

const DATABASE_PKG = join(__dirname, "..", "..", "..", "..", "..", "packages", "database")

type Shape = Map<string, Set<string>> // "schema.table" → colunas

/** Tabelas e views de `generated.ts`, com as colunas do `Row`. */
function generatedShape(): Shape {
	const source = readFileSync(join(DATABASE_PKG, "src", "generated.ts"), "utf8")
	const shape: Shape = new Map()
	const database = source.slice(source.indexOf("export type Database = {"), source.indexOf("\ntype DatabaseWithoutInternals"))
	let schema: string | null = null
	let section: string | null = null
	let table: string | null = null
	let inRow = false
	for (const line of database.split("\n")) {
		let m = /^ {2}([a-z0-9_]+): \{$/.exec(line)
		if (m) {
			schema = m[1] as string
			continue
		}
		m = /^ {4}(Tables|Views|Functions|Enums|CompositeTypes): \{$/.exec(line)
		if (m) {
			section = m[1] as string
			continue
		}
		if (section !== "Tables" && section !== "Views") continue
		m = /^ {6}([a-z_0-9]+): \{$/.exec(line)
		if (m) {
			table = m[1] as string
			shape.set(`${schema}.${table}`, new Set())
			continue
		}
		if (/^ {8}Row: \{$/.test(line)) {
			inRow = true
			continue
		}
		if (inRow && /^ {8}\}$/.test(line)) {
			inRow = false
			continue
		}
		m = /^ {10}([a-z_0-9]+)\??: /.exec(line)
		if (inRow && m && schema && table) shape.get(`${schema}.${table}`)?.add(m[1] as string)
	}
	return shape
}

/** Tabelas e views de `drizzle/schema.ts`, com o nome SQL de cada coluna. */
function drizzleShape(): Shape {
	const source = readFileSync(join(DATABASE_PKG, "drizzle", "schema.ts"), "utf8")
	const schemaNames = new Map([...source.matchAll(/export const (\w+) = pgSchema\("([^"]+)"\)/g)].map((m) => [m[1] as string, m[2] as string]))
	const shape: Shape = new Map()
	const decls = [...source.matchAll(/export const \w+ = (\w+)\.(?:table|view|materializedView)\("([^"]+)", \{/g)]
	decls.forEach((decl, i) => {
		const schema = schemaNames.get(decl[1] as string)
		if (!schema || schema === "auth") return
		const end = decls[i + 1]?.index ?? source.length
		const body = source.slice(decl.index ?? 0, end)
		const columnsBlock = body.slice(0, body.search(/\n\}(?:, \(|\)\.as|\);)/))
		const columns = new Set<string>()
		for (const m of columnsBlock.matchAll(/^\t(\w+): \w+\((?:"([^"]+)")?/gm)) columns.add((m[2] ?? m[1]) as string)
		shape.set(`${schema}.${decl[2]}`, columns)
	})
	return shape
}

describeIf("tipos do banco × schema real", () => {
	let sql: postgres.Sql
	let live: Shape

	beforeAll(async () => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
		const rows = await sql<{ table_schema: string; table_name: string; column_name: string }[]>`
			select table_schema, table_name, column_name from information_schema.columns
			where table_schema not in ('pg_catalog', 'information_schema')`
		live = new Map()
		for (const row of rows) {
			const key = `${row.table_schema}.${row.table_name}`
			if (!live.has(key)) live.set(key, new Set())
			live.get(key)?.add(row.column_name)
		}
	}, 30_000)

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	function stale(types: Shape): string[] {
		const problems: string[] = []
		for (const [table, columns] of types) {
			const real = live.get(table)
			if (!real) {
				problems.push(`${table} (tabela/view não existe)`)
				continue
			}
			for (const column of columns) if (!real.has(column)) problems.push(`${table}.${column}`)
		}
		return problems.sort()
	}

	function lagging(types: Shape, schemas: Set<string>): string[] {
		return [...live.keys()].filter((table) => schemas.has(table.split(".")[0] as string) && !types.has(table)).sort()
	}

	test("a leitura dos tipos não volta vazia (proteção contra teste que passa vazio)", () => {
		expect(generatedShape().get("procurement.purchase_item")?.has("catmat_item_codigo")).toBe(true)
		expect(drizzleShape().get("procurement.purchase_item")?.has("catmat_item_codigo")).toBe(true)
	})

	test("generated.ts não aponta para tabela ou coluna inexistente", () => {
		const types = generatedShape()
		const behind = lagging(types, new Set([...types.keys()].map((t) => t.split(".")[0] as string)))
		if (behind.length > 0) console.warn(`generated.ts atrás do banco (${behind.length}): ${behind.slice(0, 20).join(", ")} — rode db:types`)
		expect(stale(types), "generated.ts tem tabela/coluna que o banco não tem: regere com `bun --filter @iefa/database db:types`").toEqual([])
	})

	test("drizzle/schema.ts não aponta para tabela ou coluna inexistente", () => {
		const types = drizzleShape()
		const behind = lagging(types, new Set([...types.keys()].map((t) => t.split(".")[0] as string)))
		if (behind.length > 0) console.warn(`drizzle/schema.ts atrás do banco (${behind.length}): ${behind.slice(0, 20).join(", ")} — rode db:drizzle:pull`)
		expect(stale(types), "drizzle/schema.ts tem tabela/coluna que o banco não tem: regere com `bun --filter @iefa/database db:drizzle:pull`").toEqual([])
	})
})
