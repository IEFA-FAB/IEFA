import { defineConfig } from "drizzle-kit"

/** Restaura semântica libpq do sslmode p/ o driver `pg` do drizzle-kit pull. */
function withLibpqCompat(url: string | undefined): string {
	if (!url) throw new Error("SISUB_DATABASE_URL unset — required for drizzle-kit pull")
	if (url.includes("uselibpqcompat")) return url
	return `${url}${url.includes("?") ? "&" : "?"}uselibpqcompat=true&sslmode=require`
}

/**
 * Drizzle config — introspection only (DDL/migrations stay with the Supabase CLI).
 *
 * `db:drizzle:pull` reads the live `sisub` + `compras_gov_integration` schemas
 * and regenerates `drizzle/schema.ts` + `drizzle/relations.ts`. Those files are
 * the query-layer source of truth consumed by `@iefa/sisub-domain` via `getDb()`.
 * (compras_gov_integration foi separado de sisub no split de schemas por domínio;
 * o CATMAT search em operations/ingredients.ts cruza os dois schemas — Drizzle
 * faz isso numa única conexão sem a limitação de embed do PostgREST.)
 *
 * Connection: transaction pooler (port 6543) — see SISUB_DATABASE_URL in
 * apps/sisub/.env.schema. `drizzle-kit pull` tolerates either pooler.
 */
export default defineConfig({
	dialect: "postgresql",
	schema: "./drizzle/schema.ts",
	out: "./drizzle",
	schemaFilter: ["sisub", "compras_gov_integration"],
	dbCredentials: {
		// O driver `pg` (usado só pelo `drizzle-kit pull`) passou a tratar
		// `sslmode=require` como `verify-full`; sem CA verificável o pooler do
		// Supabase derruba a conexão e o pull falha silencioso ("0 tables").
		// `uselibpqcompat=true` restaura a semântica fraca do libpq só para a
		// introspecção. O runtime (postgres-js em db.server.ts) usa outro driver
		// e não é afetado.
		url: withLibpqCompat(process.env.SISUB_DATABASE_URL),
	},
	// No `migrations` block: this workflow is `drizzle-kit pull` only — DDL/migrations
	// stay with the Supabase CLI, so `drizzle-kit generate` (which `migrations.*`
	// configures) is never run.
})
