import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SUPABASE_SCHEMAS, supabaseArgs } from "./supabase-schemas"

describe("supabaseArgs", () => {
	test("os três comandos usam a mesma lista de schemas", () => {
		const list = SUPABASE_SCHEMAS.join(",")
		for (const command of ["types", "pull", "diff"] as const) expect(supabaseArgs(command)).toContain(list)
	})

	test("o package.json chama o script, sem lista própria", () => {
		const scripts = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")).scripts as Record<string, string>
		for (const name of ["db:types", "db:pull", "db:diff"]) expect(scripts[name], name).not.toContain("--schema")
	})

	test("todo schema da lista está nos tipos gerados", () => {
		const generated = readFileSync(join(import.meta.dir, "..", "src", "generated.ts"), "utf8")
		for (const schema of SUPABASE_SCHEMAS) expect(generated, schema).toContain(`\n  ${schema}: {`)
	})
})
