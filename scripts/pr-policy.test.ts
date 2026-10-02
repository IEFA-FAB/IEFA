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

	test("todo caminho citado na lista do AGENTS.md cai numa regra daqui", () => {
		const agents = readFileSync(join(import.meta.dir, "../AGENTS.md"), "utf8")
		const section = agents.slice(agents.indexOf("**Esperam o mantenedor**"), agents.indexOf("**Commits e título do PR:**"))
		// Itens entre crases que são caminho (têm `/` ou `.`), fora o próprio comando de exemplo.
		const cited = [...section.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]).filter((item) => /[/.]/.test(item) && !item.startsWith("bun "))
		expect(cited.length).toBeGreaterThan(8)
		for (const item of cited) {
			const sample = item.replace(/\*\*$/, "x/y.ts").replace(/\/$/, "/x.yaml")
			expect(classifyPrFiles([sample]).decision, `${item} (amostra ${sample}) não cai em regra do pr-policy`).toBe("maintainer")
		}
	})

	test("arquivo renomeado: o caminho de origem também decide", () => {
		expect(classifyPrFiles(["scripts/guard.ts", ".claude/hooks/guard.ts"]).decision).toBe("maintainer")
	})
})
