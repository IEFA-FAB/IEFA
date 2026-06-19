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
 *   relations.ts
 *     7. Drop duplicate relation properties (redundant duplicate FK constraints in
 *        the DB emit identical relation keys → TS1117 "duplicate property").
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import postgres from "postgres"

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
				`export const userLevels = pgEnum("userLevels", [${literals}]);`,
		)
	}
	// ensure pgEnum is imported (used by the injected enum)
	if (out.includes("pgEnum(") && !/\bpgEnum\b[^"]*from "drizzle-orm\/pg-core"/.test(out)) {
		out = out.replace(/import \{ ([^}]*) \} from "drizzle-orm\/pg-core"/, (_m, names) =>
			names.includes("pgEnum") ? `import { ${names} } from "drizzle-orm/pg-core"` : `import { pgEnum, ${names} } from "drizzle-orm/pg-core"`,
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

	return out
}

/**
 * Remove duplicate top-level relation properties within each `relations(...)` block.
 * A property spans from `\t<key>: one|many(` to its closing `\t}),`. Keep the first
 * occurrence of each key per block; drop later identical keys.
 */
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
const patchedRelations = patchRelations(relations)
if (patchedRelations !== relations) writeFileSync(relationsPath, patchedRelations)

console.log(`patched: schema=${patchedSchema !== schema} relations=${patchedRelations !== relations}`)
