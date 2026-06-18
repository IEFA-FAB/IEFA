import { defineConfig } from "drizzle-kit"

/**
 * Drizzle config — introspection only (DDL/migrations stay with the Supabase CLI).
 *
 * `db:drizzle:pull` reads the live `sisub` schema and regenerates
 * `drizzle/schema.ts` + `drizzle/relations.ts`. Those files are the query-layer
 * source of truth consumed by `@iefa/sisub-domain` via `getDb()`.
 *
 * Connection: transaction pooler (port 6543) — see SISUB_DATABASE_URL in
 * apps/sisub/.env.schema. `drizzle-kit pull` tolerates either pooler.
 */
export default defineConfig({
	dialect: "postgresql",
	schema: "./drizzle/schema.ts",
	out: "./drizzle",
	schemaFilter: ["sisub"],
	dbCredentials: {
		// biome-ignore lint/style/noNonNullAssertion: pull fails loudly if unset
		url: process.env.SISUB_DATABASE_URL!,
	},
	// Keep generated tables in TS files we re-export; do not emit SQL migrations.
	migrations: {
		prefix: "timestamp",
	},
})
