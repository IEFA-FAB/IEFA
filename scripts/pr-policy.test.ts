import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { classifyPrFiles } from "./pr-policy"

describe("classifyPrFiles", () => {
	test("código de app e de pacote: o agente mergeia", () => {
		expect(classifyPrFiles(["apps/sisub/src/server/stock.fn.ts", "packages/auth-kit/src/index.ts", "README.md"]).decision).toBe("auto")
	})

	test("cada item da lista do AGENTS.md espera o mantenedor", () => {
		for (const file of [
			"packages/database/supabase/migrations/20261002120000_x.sql",
			"infra/sisub/main.tf",
			"apps/sisub/.env.schema",
			".github/workflows/deploy.yml",
			".opengrep/rules/utc-civil-date.yaml",
			".claude/hooks/guard.ts",
			".claude/settings.json",
			"commitlint.config.ts",
			"biome.json",
			".oxlintrc.tailwind.jsonc",
			"turbo.json",
			"apps/sisub/turbo.json",
		]) {
			expect(classifyPrFiles([file]).decision, file).toBe("maintainer")
		}
	})

	test("diz qual arquivo e por quê", () => {
		const verdict = classifyPrFiles(["apps/sisub/src/x.ts", "infra/alpha/main.tf"])
		expect(verdict.matches).toEqual([{ file: "infra/alpha/main.tf", reason: "infra/**" }])
	})

	test("a lista do AGENTS.md e a do script falam dos mesmos gates", () => {
		const agents = readFileSync(join(import.meta.dir, "../AGENTS.md"), "utf8")
		const section = agents.slice(agents.indexOf("**Esperam o mantenedor**"), agents.indexOf("**Commits e título do PR:**"))
		for (const gate of [
			".github/**",
			".opengrep/rules/",
			".claude/hooks/",
			".claude/settings.json",
			"commitlint.config.ts",
			"biome.json",
			".oxlintrc.tailwind.jsonc",
			"turbo.json",
			"infra/**",
		]) {
			expect(section, `AGENTS.md não cita ${gate}`).toContain(gate)
		}
	})
})
