import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { readProjectId, SUPABASE_SCHEMAS, supabaseArgs } from "./supabase-schemas"

const PACKAGE_DIR = join(import.meta.dir, "..")

describe("supabaseArgs", () => {
	test("argv de cada comando, com as flags extras passando direto", () => {
		const schemas = SUPABASE_SCHEMAS.join(",")
		expect(supabaseArgs("types", "ref", ["--local"])).toEqual(["gen", "types", "typescript", "--project-id", "ref", "--schema", schemas, "--local"])
		expect(supabaseArgs("diff", "ref", ["-f", "add_x"])).toEqual(["db", "diff", "--schema", schemas, "-f", "add_x"])
		expect(supabaseArgs("pull", "ref")).toEqual(["db", "pull", "--schema", schemas])
		expect(supabaseArgs("link", "ref")).toEqual(["link", "--project-ref", "ref"])
	})
})

describe("fonte única", () => {
	test("o project id vem do config.toml do CLI", () => {
		expect(readProjectId(readFileSync(join(PACKAGE_DIR, "supabase", "config.toml"), "utf8"))).toMatch(/^[a-z]{20}$/)
	})

	test("o package.json chama o script, sem lista nem project id próprios", () => {
		const scripts = JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8")).scripts as Record<string, string>
		for (const name of ["db:types", "db:pull", "db:diff", "db:link"]) {
			expect(scripts[name], name).toContain("scripts/supabase-schemas.ts")
			expect(scripts[name], name).not.toMatch(/--schema|--project-(id|ref)/)
		}
	})

	test("os schemas do tipo Database do generated.ts são exatamente os da lista", () => {
		const generated = readFileSync(join(PACKAGE_DIR, "src", "generated.ts"), "utf8")
		const database = generated.slice(generated.indexOf("export type Database = {"), generated.indexOf("\ntype DatabaseWithoutInternals"))
		const inTypes = [...database.matchAll(/^ {2}([a-z0-9_]+): \{$/gm)].map((m) => m[1]).filter((name) => name !== "__InternalSupabase")
		expect(inTypes.sort()).toEqual([...SUPABASE_SCHEMAS].sort())
	})
})
