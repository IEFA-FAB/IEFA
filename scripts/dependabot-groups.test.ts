import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// O Dependabot põe cada dependência no grupo "mais específico", não no primeiro, e um grupo só de
// `update-types` ganha de um padrão `@escopo/*`. Por isso o `minor-and-patch` exclui todos os
// padrões das famílias: sem isso a família é engolida por ele (foi o `@tanstack/ai` do #415/#522).
// Este teste é a única conferência antes do merge; o próprio GitHub só valida depois.

type Group = { patterns?: string[]; "exclude-patterns"?: string[]; "update-types"?: string[] }

const ROOT = join(import.meta.dir, "..")
const CATCH_ALL = "minor-and-patch"

const config = Bun.YAML.parse(readFileSync(join(ROOT, ".github/dependabot.yml"), "utf8")) as {
	updates: { "package-ecosystem": string; groups?: Record<string, Group> }[]
}
const groups = config.updates.find((u) => u["package-ecosystem"] === "bun")?.groups ?? {}
const families = Object.entries(groups).filter(([name]) => name !== CATCH_ALL)

// Mesma semântica do WildcardMatcher do Dependabot: `*` casa qualquer sequência.
const toRegExp = (pattern: string) =>
	new RegExp(
		`^${pattern
			.split("*")
			.map((part) => part.replace(/[.+?^${}()|[\]\\/]/g, "\\$&"))
			.join(".*")}$`,
		"i"
	)
const isInGroup = (group: Group, name: string) =>
	(group.patterns?.some((p) => toRegExp(p).test(name)) ?? true) && !(group["exclude-patterns"] ?? []).some((p) => toRegExp(p).test(name))

const readDependencyNames = (): string[] => {
	const manifests = [join(ROOT, "package.json")]
	for (const base of ["apps", "packages"]) {
		for (const dir of readdirSync(join(ROOT, base))) {
			const manifest = join(ROOT, base, dir, "package.json")
			if (existsSync(manifest)) manifests.push(manifest)
		}
	}
	const names = new Set<string>()
	for (const manifest of manifests) {
		const pkg = JSON.parse(readFileSync(manifest, "utf8"))
		for (const field of ["dependencies", "devDependencies"]) {
			for (const name of Object.keys(pkg[field] ?? {})) names.add(name)
		}
	}
	return [...names].sort()
}

describe("grupos do Dependabot (bun)", () => {
	test("o grupo catch-all existe e só filtra por update-types", () => {
		expect(groups[CATCH_ALL]?.["update-types"]).toEqual(["minor", "patch"])
		expect(groups[CATCH_ALL]?.patterns).toBeUndefined()
	})

	test("todo padrão de família está excluído do catch-all", () => {
		const catchAll = groups[CATCH_ALL] as Group
		const leaking = families.flatMap(([name, group]) =>
			(group.patterns ?? [])
				.map((pattern) => pattern.replaceAll("*", "zz"))
				.filter((sample) => isInGroup(catchAll, sample))
				.map((sample) => `${name}: ${sample}`)
		)
		expect(leaking).toEqual([])
	})

	test("nenhuma dependência direta cai em duas famílias", () => {
		const overlapping = readDependencyNames()
			.map((dep) => ({ dep, hits: families.filter(([, group]) => isInGroup(group, dep)).map(([name]) => name) }))
			.filter(({ hits }) => hits.length > 1)
		expect(overlapping).toEqual([])
	})

	test("as famílias que andam juntas têm grupo próprio", () => {
		const groupOf = (dep: string) => families.find(([, group]) => isInGroup(group, dep))?.[0]
		expect(groupOf("@tanstack/ai")).toBe(groupOf("@tanstack/ai-openai"))
		expect(groupOf("@tanstack/react-router")).toBe(groupOf("@tanstack/react-start"))
		expect(groupOf("nitro")).toBe(groupOf("h3"))
		expect(groupOf("@aws-sdk/client-bedrock-runtime")).toBe("aws-sdk")
		expect(groupOf("@tanstack/ai")).not.toBe(groupOf("@tanstack/react-router"))
	})
})
