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
 *     3. `role: unknown("role")` (unparsed `public.userLevels`) → `userLevels("role")`.
 *     4. Cross-schema FK refs `[users.id]` → `[usersInAuth.id]`.
 *     5. View option `{"securityInvoker":"on"}` (string) → `{ securityInvoker: true }`.
 *     6. Empty-string default mis-escaped as `.default(')` → `.default("")`.
 *   relations.ts
 *     7. Drop duplicate relation properties (redundant duplicate FK constraints in
 *        the DB emit identical relation keys → TS1117 "duplicate property").
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle")
const schemaPath = join(drizzleDir, "schema.ts")
const relationsPath = join(drizzleDir, "relations.ts")

function patchSchema(src: string): string {
	let out = src

	// 1. unused pgTable import
	out = out.replace(/import \{ pgTable, /, "import { ")

	// 2. inject auth.users stub + public userLevels enum right after the sisub schema decl.
	const anchor = 'export const sisub = pgSchema("sisub");'
	if (out.includes(anchor) && !out.includes("export const usersInAuth")) {
		out = out.replace(
			anchor,
			`${anchor}\n` +
				`// Patched (patch-drizzle-pull.ts): cross-schema/custom-type refs the pull leaves dangling.\n` +
				`export const usersInAuth = pgSchema("auth").table("users", { id: uuid().primaryKey().notNull() });\n` +
				`export const userLevels = pgEnum("userLevels", ['user', 'admin', 'superadmin']);`,
		)
	}
	// ensure pgEnum is imported (used by the injected enum)
	if (out.includes("pgEnum(") && !/\bpgEnum\b[^"]*from "drizzle-orm\/pg-core"/.test(out)) {
		out = out.replace(/import \{ ([^}]*) \} from "drizzle-orm\/pg-core"/, (_m, names) =>
			names.includes("pgEnum") ? `import { ${names} } from "drizzle-orm/pg-core"` : `import { pgEnum, ${names} } from "drizzle-orm/pg-core"`,
		)
	}

	// 3. unparsed custom enum column
	out = out.replace(/\bunknown\("role"\)/g, 'userLevels("role")')

	// 4. cross-schema FK target
	out = out.replace(/foreignColumns: \[users\.id\]/g, "foreignColumns: [usersInAuth.id]")

	// 5. view securityInvoker string → boolean
	out = out.replace(/\{"securityInvoker":"on"\}/g, "{ securityInvoker: true }")

	// 6. empty-string default mis-escape
	out = out.replace(/\.default\('\)\.notNull\(\)/g, '.default("").notNull()')

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
const patchedSchema = patchSchema(schema)
if (patchedSchema !== schema) writeFileSync(schemaPath, patchedSchema)

const relations = readFileSync(relationsPath, "utf8")
const patchedRelations = patchRelations(relations)
if (patchedRelations !== relations) writeFileSync(relationsPath, patchedRelations)

console.log(`patched: schema=${patchedSchema !== schema} relations=${patchedRelations !== relations}`)
