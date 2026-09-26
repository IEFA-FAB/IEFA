/**
 * Post-`drizzle-kit pull` patcher — runs automatically after `db:drizzle:pull`.
 *
 * `drizzle-kit pull` (v0.31) mis-generates a handful of constructs for this DB.
 * Each fix below regenerates on every pull, so they live here (idempotent) rather
 * than as fragile hand-edits. DDL stays owned by the Supabase CLI; this only
 * massages the generated TS so it compiles and matches the live schema.
 *
 * Fixes:
 *   schema.ts
 *     1. Drop unused `pgTable` import (everything uses `sisub.table`) → TS6133.
 *     2. Inject `usersInAuth` (auth.users) stub + `userLevels` public enum, which
 *        the introspection references but never declares (schemaFilter = sisub).
 *        Enum values are read from the live DB (`pg_enum`) so they never drift —
 *        a new label (e.g. 'moderator') flows through on the next pull.
 *     3. `role: unknown("role")` (unparsed `public.userLevels`) → `userLevels("role")`,
 *        and strip the stale `// TODO: failed to parse database type 'userLevels'`
 *        comment drizzle-kit emits above it.
 *     4. Cross-schema FK refs `[users.id]` → `[usersInAuth.id]`.
 *     5. View option `{"securityInvoker":"on"}` (string) → `{ securityInvoker: true }`.
 *     6. Empty-string default mis-escaped as `.default(')` → `.default("")` (both the
 *        `.notNull()` and the nullable variant).
 *     7. Every `numeric(...)` gets `{ mode: "number" }` (and its string default becomes a
 *        number). The pull emits the default string mode, so the driver's `"30"` reached
 *        the app while the Supabase-generated contract said `number`. Each read path had
 *        to remember a `Number()`/`toNumeric`; the ones that forgot sent the string back
 *        into a `z.number()` validator (weekly plan save, day-menu item card). All
 *        numeric columns here fit a double (money is `numeric(12,4)`).
 *     8. Mutual FK cycles (A → B and B → A in the `foreignKey()` extras) make TypeScript
 *        infer `any` for both tables (TS7022/TS7024), and the `any` leaks into every
 *        relation typing. The entry in the table declared FIRST is dropped, with a comment:
 *        the constraint stays in the DB, and `relations.ts` (what `db.query … with` reads)
 *        still has both directions. Found: food_item ↔ food_item_revision,
 *        goods_receipt ↔ liquidacao, inventory_count ↔ stock_adjustment.
 *     9. Drop the `AnyPgColumn` import and `(table) =>` params the pull leaves unused.
 *    10. `bigserial({ mode: "bigint" })` → `{ mode: "number" }`. The pull emits JS `bigint` for
 *        serial ids while every `bigint(...)` column already comes as `number`; with the mix,
 *        `eq(rancho.id, ranchoId)` stops type-checking. Ids here fit a double.
 *    12. Defaults the pull truncates at a nested parenthesis
 *        (`sql\`((now() AT TIME ZONE 'America/Sao_Paulo'\``) are replaced by the live default
 *        read from `pg_attrdef`, so the file never carries invalid SQL.
 *    11. Default that calls a DB function (`.default(inventory.lot_short_code())`) is emitted
 *        as a TS call on the schema object → becomes `sql\`inventory.lot_short_code()\``.
 *   relations.ts
 *     7. Drop duplicate relation properties (redundant duplicate FK constraints in
 *        the DB emit identical relation keys → TS1117 "duplicate property").
 *     8. Logical relations the DB does not declare as FK. `purchase_item_ingredient.ingredient_id`
 *        points at `core.item` since the item nucleus migration, and `kitchen.ingredient.id` is
 *        the same id (1:1, trigger `ingredient_sync_item`). The domain reads the ingredient
 *        through the link (`with: { ingredientInKitchen }`), so the relation is re-added here —
 *        before, it lived in a hand-edited relations.ts that nobody could regenerate.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import postgres from "postgres"
import { escapeTemplateLiteral } from "../src/template-literal.ts"

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle")
const schemaPath = join(drizzleDir, "schema.ts")
const relationsPath = join(drizzleDir, "relations.ts")

/**
 * Read the live `public.userLevels` enum labels. The pull leaves the column as
 * `unknown("role")` (schemaFilter = sisub excludes the public enum), so we resolve
 * the values from the DB instead of hardcoding them — keeping the injected enum in
 * lockstep with the schema. Same `SISUB_DATABASE_URL` the pull just used.
 */
async function fetchUserLevels(): Promise<string[]> {
	const url = process.env.SISUB_DATABASE_URL
	if (!url) throw new Error("SISUB_DATABASE_URL unset — required to resolve public.userLevels enum")
	const sql = postgres(url, { max: 1 })
	try {
		const rows = await sql<{ value: string }[]>`
			select e.enumlabel as value
			from pg_enum e
			join pg_type t on t.oid = e.enumtypid
			join pg_namespace n on n.oid = t.typnamespace
			where t.typname = 'userLevels' and n.nspname = 'public'
			order by e.enumsortorder
		`
		if (rows.length === 0) throw new Error("public.userLevels enum not found — patcher cannot inject it")
		return rows.map((r) => r.value)
	} finally {
		await sql.end()
	}
}

async function patchSchema(src: string): Promise<string> {
	let out = src

	// 1. unused pgTable import
	out = out.replace(/import \{ pgTable, /, "import { ")

	// 2. inject auth.users stub + public userLevels enum right after the sisub schema decl.
	const anchor = 'export const sisub = pgSchema("sisub");'
	if (out.includes(anchor) && !out.includes("export const usersInAuth")) {
		const levels = await fetchUserLevels()
		const literals = levels.map((v) => `'${v}'`).join(", ")
		out = out.replace(
			anchor,
			`${anchor}\n` +
				`// Patched (patch-drizzle-pull.ts): cross-schema/custom-type refs the pull leaves dangling.\n` +
				`export const usersInAuth = pgSchema("auth").table("users", { id: uuid().primaryKey().notNull() });\n` +
				`export const userLevels = pgEnum("userLevels", [${literals}]);`
		)
	}
	// ensure pgEnum is imported (used by the injected enum)
	if (out.includes("pgEnum(") && !/\bpgEnum\b[^"]*from "drizzle-orm\/pg-core"/.test(out)) {
		out = out.replace(/import \{ ([^}]*) \} from "drizzle-orm\/pg-core"/, (_m, names) =>
			names.includes("pgEnum") ? `import { ${names} } from "drizzle-orm/pg-core"` : `import { pgEnum, ${names} } from "drizzle-orm/pg-core"`
		)
	}

	// 3. unparsed custom enum column + its now-inaccurate TODO comment
	out = out.replace(/[ \t]*\/\/ TODO: failed to parse database type 'userLevels'\n/g, "")
	out = out.replace(/\bunknown\("role"\)/g, 'userLevels("role")')

	// 4. cross-schema FK target
	out = out.replace(/foreignColumns: \[users\.id\]/g, "foreignColumns: [usersInAuth.id]")

	// 5. view securityInvoker string → boolean
	out = out.replace(/\{"securityInvoker":"on"\}/g, "{ securityInvoker: true }")

	// 6. empty-string default mis-escape (both `.notNull()` and nullable variants)
	out = out.replace(/\.default\('\)/g, '.default("")')

	// 7. numeric → mode "number" (idempotent: a config that already has `mode:` is left alone)
	out = out.replace(/\bnumeric\((?:"([a-z0-9_]+)"(?:, )?)?(?:\{ (?![^}]*\bmode:)([^}]*?)\s*\})?\)((?:\.default\('-?[0-9.]+'\))?)/g, (_m, name, config, def) => {
		const options = config ? `{ mode: "number", ${config.replace(/\s+/g, " ")} }` : '{ mode: "number" }'
		const args = name ? `"${name}", ${options}` : options
		return `numeric(${args})${def ? def.replace(/'/g, "") : ""}`
	})

	// 8. mutual FK cycles
	out = breakForeignKeyCycles(out)

	// 10. serial ids as number (unnamed and named: `bigserial("order_seq", { mode: "bigint" })`)
	out = out.replace(/bigserial\((\s*"[^"]+",\s*)?\{ mode: "bigint" \}\)/g, (_m, name: string | undefined) => `bigserial(${name ?? ""}{ mode: "number" })`)

	// 11. DB-function defaults
	const schemaNames = new Map([...out.matchAll(/export const (\w+) = pgSchema\("([^"]+)"\)/g)].map((m) => [m[1] as string, m[2] as string]))
	out = out.replace(/\.default\((\w+)\.(\w+)\(\)\)/g, (whole, schemaVar: string, fn: string) => {
		const dbSchema = schemaNames.get(schemaVar)
		return dbSchema ? `.default(sql\`${dbSchema}.${fn}()\`)` : whole
	})

	// 9. unused leftovers of the pull
	if (!/\(\): AnyPgColumn|: AnyPgColumn\b/.test(out.replace(/import \{[^}]*\} from "drizzle-orm\/pg-core"/, ""))) {
		out = out.replace(
			/import \{ ([^}]*) \} from "drizzle-orm\/pg-core"/,
			(_m, names: string) =>
				`import { ${names
					.split(",")
					.map((n) => n.trim())
					.filter((n) => n && n !== "AnyPgColumn" && n !== "type AnyPgColumn")
					.join(", ")} } from "drizzle-orm/pg-core"`
		)
	}
	// `}, (table) => [` whose body never reads `table` (only `unique(...).on(...)` literals, etc.)
	out = out.replace(/\}, \(table\) => \[([\s\S]*?)\n\]\)/g, (whole, body: string) => (/\btable\./.test(body) ? whole : `}, () => [${body}\n])`))

	// 12. truncated defaults
	out = await restoreTruncatedDefaults(out)

	return out
}

/** Defaults `sql\`…\`` com parênteses desbalanceados → o default real do banco. */
async function restoreTruncatedDefaults(src: string): Promise<string> {
	const broken = [...src.matchAll(/\.default\(sql`([^`]*)`\)/g)].filter((m) => (m[1]?.split("(").length ?? 0) !== (m[1]?.split(")").length ?? 0))
	if (broken.length === 0) return src
	const url = process.env.SISUB_DATABASE_URL
	if (!url) throw new Error("SISUB_DATABASE_URL unset — required to restore truncated defaults")
	const db = postgres(url, { max: 1 })
	let defaults: { schema: string; table: string; column: string; expr: string }[]
	try {
		defaults = await db<{ schema: string; table: string; column: string; expr: string }[]>`
			select n.nspname as schema, c.relname as table, a.attname as column, pg_get_expr(d.adbin, d.adrelid) as expr
			  from pg_attrdef d
			  join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
			  join pg_class c on c.oid = d.adrelid
			  join pg_namespace n on n.oid = c.relnamespace`
	} finally {
		await db.end()
	}
	const schemaNames = new Map([...src.matchAll(/export const (\w+) = pgSchema\("([^"]+)"\)/g)].map((m) => [m[1] as string, m[2] as string]))
	// Linha a linha: `\t<chave>: <tipo>("<coluna>"?…).default(sql\`<truncado>\`)`
	return src.replace(
		/^(\t(\w+): \w+\((?:"([^"]+)")?[^\n]*?\.default\(sql`)([^`]*)(`\)[^\n]*)$/gm,
		(line, pre: string, key: string, name: string | undefined, expr: string, post: string, offset: number) => {
			if (expr.split("(").length === expr.split(")").length) return line
			const block = tableBlocks(src).find((b) => offset >= b.start && offset < b.end)
			const head = block ? /export const \w+ = (\w+)\.(?:table|view|materializedView)\("([^"]+)"/.exec(src.slice(block.start, block.end)) : null
			const schema = head ? schemaNames.get(head[1] as string) : undefined
			const column = name ?? key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
			const live = defaults.find((d) => d.schema === schema && d.table === head?.[2] && d.column === column)
			return live ? `${pre}${escapeTemplateLiteral(live.expr)}${post}` : line
		}
	)
}

/** Nome da tabela de cada `export const X = <schema>.table(` e o trecho do arquivo que ela ocupa. */
function tableBlocks(src: string): { name: string; start: number; end: number }[] {
	const starts = [...src.matchAll(/export const (\w+) = \w+\.(?:table|view|materializedView)\(/g)].map((m) => ({ name: m[1] as string, start: m.index ?? 0 }))
	return starts.map((s, i) => ({ ...s, end: starts[i + 1]?.start ?? src.length }))
}

function breakForeignKeyCycles(src: string): string {
	const blocks = tableBlocks(src)
	const refs = new Map(blocks.map((b) => [b.name, new Set([...src.slice(b.start, b.end).matchAll(/foreignColumns: \[(\w+)\./g)].map((m) => m[1] as string))]))
	const position = new Map(blocks.map((b, i) => [b.name, i]))
	const drops: { table: string; target: string }[] = []
	for (const [table, targets] of refs) {
		for (const target of targets) {
			if (target === table || !refs.get(target)?.has(table)) continue
			if ((position.get(table) ?? 0) < (position.get(target) ?? 0)) drops.push({ table, target })
		}
	}
	let out = src
	for (const { table, target } of drops) {
		// Blocos de `out`, recalculados a cada volta: a remoção anterior mudou os tamanhos.
		const block = tableBlocks(out).find((b) => b.name === table)
		if (!block) continue
		const body = out.slice(block.start, block.end)
		const fk = new RegExp(
			`\\tforeignKey\\(\\{\\s*columns: \\[[^\\]]*\\],\\s*foreignColumns: \\[${target}\\.[^\\]]*\\],\\s*name: "([^"]+)"\\s*\\}\\)(?:\\.on\\w+\\("[^"]*"\\))*,\\n`,
			"g"
		)
		const patched = body.replace(
			fk,
			(_m, name: string) =>
				`\t// FK "${name}" omitida (patch-drizzle-pull.ts): ciclo com ${target} faria o TS inferir any. Existe no banco; a relação segue em relations.ts.\n`
		)
		out = out.slice(0, block.start) + patched + out.slice(block.end)
	}
	return out
}

/**
 * Remove duplicate top-level relation properties within each `relations(...)` block.
 * A property spans from `\t<key>: one|many(` to its closing `\t}),`. Keep the first
 * occurrence of each key per block; drop later identical keys.
 */
/** Relações lógicas que o banco não declara como FK (ver cabeçalho, relations.ts 8). */
const LOGICAL_RELATIONS: { block: string; property: string; code: string }[] = [
	{
		block: "purchaseItemIngredientInProcurementRelations",
		property: "ingredientInKitchen",
		code: `\tingredientInKitchen: one(ingredientInKitchen, {\n\t\tfields: [purchaseItemIngredientInProcurement.ingredientId],\n\t\treferences: [ingredientInKitchen.id]\n\t}),`,
	},
]

function addLogicalRelations(src: string): string {
	let out = src
	for (const { block, property, code } of LOGICAL_RELATIONS) {
		const head = new RegExp(`(export const ${block} = relations\\([^,]+, \\(\\{)([^}]*)(\\}\\) => \\(\\{\\n)`)
		const match = out.match(head)
		if (!match || match.index === undefined) continue
		const start = match.index
		const end = out.indexOf("\n}));", start)
		if (out.slice(start, end).includes(`\t${property}:`)) continue
		const helpers = (match[2] as string)
			.split(",")
			.map((h) => h.trim())
			.filter(Boolean)
		const needs = code.includes("one(") ? "one" : "many"
		const header = helpers.includes(needs) ? match[0] : `${match[1]}${[...helpers, needs].join(", ")}${match[3]}`
		out = out.slice(0, start) + header + code + "\n" + out.slice(start + match[0].length)
	}
	return out
}

function patchRelations(src: string): string {
	const lines = src.split("\n")
	const result: string[] = []
	let seen = new Set<string>()
	let inBlock = false
	const propStart = /^\t(\w+): (?:one|many)\(/
	let skipping = false

	for (const line of lines) {
		if (/=\s*relations\(/.test(line)) {
			inBlock = true
			seen = new Set()
		}

		if (inBlock && !skipping) {
			const m = line.match(propStart)
			if (m) {
				const key = m[1]
				if (seen.has(key)) {
					skipping = true // drop this whole property block
					continue
				}
				seen.add(key)
			}
		}

		if (skipping) {
			// drop lines until the property block closes
			if (/^\t\}\),?$/.test(line)) skipping = false
			continue
		}

		if (/^\}\)\);?$/.test(line)) inBlock = false
		result.push(line)
	}
	return result.join("\n")
}

const schema = readFileSync(schemaPath, "utf8")
const patchedSchema = await patchSchema(schema)
if (patchedSchema !== schema) writeFileSync(schemaPath, patchedSchema)

const relations = readFileSync(relationsPath, "utf8")
const patchedRelations = addLogicalRelations(patchRelations(relations))
if (patchedRelations !== relations) writeFileSync(relationsPath, patchedRelations)

console.log(`patched: schema=${patchedSchema !== schema} relations=${patchedRelations !== relations}`)
