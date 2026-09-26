import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { displaySubmitterName, MISSING_SUBMITTER_NAME } from "./profile"

const SRC = join(import.meta.dir, "..", "..")

describe("displaySubmitterName", () => {
	test("com perfil, o nome", () => {
		expect(displaySubmitterName("Maria Souza")).toBe("Maria Souza")
		expect(displaySubmitterName("  Maria Souza ")).toBe("Maria Souza")
	})

	test("sem perfil (LEFT JOIN nulo) ou nome em branco, o aviso", () => {
		expect(displaySubmitterName(null)).toBe(MISSING_SUBMITTER_NAME)
		expect(displaySubmitterName(undefined)).toBe(MISSING_SUBMITTER_NAME)
		expect(displaySubmitterName("   ")).toBe(MISSING_SUBMITTER_NAME)
	})
})

/**
 * Desde 20260926218000 o cadastro do Auth não cria perfil do journal: ele nasce no primeiro uso.
 * A submissão é o único fluxo que precisa dele (nome do autor no painel e nos e-mails).
 */
describe("perfil sob demanda — contratos do servidor e da rota", () => {
	test("submitArticleFn exige o perfil antes de promover o rascunho", () => {
		const source = readFileSync(join(SRC, "server", "journal.fn.ts"), "utf8")
		const start = source.indexOf("export const submitArticleFn =")
		const body = source.slice(start, source.indexOf("\n\t})\n", start))
		const guard = body.indexOf("await requireJournalProfile(userId)")
		const write = body.indexOf('.from("articles")')
		expect(guard).toBeGreaterThan(-1)
		expect(write).toBeGreaterThan(guard)
	})

	test("requireJournalProfile lê o perfil sem assumir que ele existe", () => {
		const source = readFileSync(join(SRC, "lib", "auth.server.ts"), "utf8")
		const start = source.indexOf("export async function requireJournalProfile(")
		const body = source.slice(start, source.indexOf("\n}\n", start))
		expect(body).toContain(".maybeSingle()")
		expect(body).toContain("forbidden(JOURNAL_PROFILE_REQUIRED_MESSAGE)")
	})

	test("a rota de submissão manda para o onboarding quem ainda não tem perfil", () => {
		const source = readFileSync(join(SRC, "routes", "journal", "submit.tsx"), "utf8")
		expect(source).toMatch(/if \(!profile\) throw redirect\(\{ to: "\/journal" \}\)/)
	})

	test("a entrada do journal mostra o onboarding sem perfil", () => {
		const source = readFileSync(join(SRC, "routes", "journal", "index.tsx"), "utf8")
		expect(source).toContain("if (auth.isAuthenticated && !profile) {")
		expect(source).toContain("<ProfileOnboarding />")
	})
})
