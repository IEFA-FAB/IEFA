import { describe, expect, test } from "bun:test"
import type { SupabaseClient } from "@supabase/supabase-js"
import { displaySubmitterName, fetchJournalProfile, loadSubmitPrerequisites, MISSING_SUBMITTER_NAME, resolveProfileNext } from "./profile"

/** Cliente falso: registra a consulta e devolve o resultado dado ao `maybeSingle()`. */
function fakeClient(result: { data: unknown; error: { message: string } | null }) {
	const calls: { table?: string; columns?: string; filter?: [string, unknown] } = {}
	const db = {
		from(table: string) {
			calls.table = table
			return {
				select(columns: string) {
					calls.columns = columns
					return {
						eq(column: string, value: unknown) {
							calls.filter = [column, value]
							return { maybeSingle: async () => result }
						},
					}
				},
			}
		},
	} as unknown as Pick<SupabaseClient, "from">
	return { db, calls }
}

describe("fetchJournalProfile — a leitura única do perfil", () => {
	test("perfil existente: id e papel, lidos pelo id", async () => {
		const { db, calls } = fakeClient({ data: { id: "u1", role: "editor" }, error: null })
		expect(await fetchJournalProfile(db, "u1")).toEqual({ id: "u1", role: "editor" })
		expect(calls).toEqual({ table: "user_profiles", columns: "id, role", filter: ["id", "u1"] })
	})

	test("sem perfil (o cadastro não cria mais): null", async () => {
		const { db } = fakeClient({ data: null, error: null })
		expect(await fetchJournalProfile(db, "u2")).toBeNull()
	})

	test("erro do banco lança, em vez de virar 'sem perfil'", async () => {
		const { db } = fakeClient({ data: null, error: { message: "timeout" } })
		await expect(fetchJournalProfile(db, "u3")).rejects.toThrow("Falha ao ler o perfil do journal: timeout")
	})
})

describe("loadSubmitPrerequisites — a rota de submissão sem perfil", () => {
	test("sem perfil: manda ao formulário com a volta marcada e não busca o rascunho", async () => {
		let draftReads = 0
		const loaded = await loadSubmitPrerequisites({
			readProfile: async () => null,
			readDraft: async () => {
				draftReads++
				return { id: "d1" }
			},
			next: "/journal/submit?step=1",
		})
		expect(loaded).toEqual({ status: "needs-profile", redirect: { to: "/journal/profile", search: { next: "/journal/submit?step=1" } } })
		expect(draftReads).toBe(0)
	})

	test("com perfil: carrega o rascunho depois do perfil", async () => {
		const order: string[] = []
		const loaded = await loadSubmitPrerequisites({
			readProfile: async () => {
				order.push("profile")
				return { id: "u1" }
			},
			readDraft: async () => {
				order.push("draft")
				return null
			},
			next: "/journal/submit",
		})
		expect(loaded).toEqual({ status: "ready", profile: { id: "u1" }, draft: null })
		expect(order).toEqual(["profile", "draft"])
	})
})

describe("resolveProfileNext — a volta depois de salvar o perfil", () => {
	test("caminho do journal passa", () => {
		expect(resolveProfileNext("/journal/submit?step=1")).toBe("/journal/submit?step=1")
	})

	test.each([undefined, 3, "https://evil.example/journal/submit", "//evil.example/journal", "/auth", "/journalx", "journal/submit"])(
		"%p é ignorado",
		(value) => {
			expect(resolveProfileNext(value)).toBeUndefined()
		}
	)
})

describe("displaySubmitterName", () => {
	test("com perfil, o nome", () => {
		expect(displaySubmitterName("  Maria Souza ")).toBe("Maria Souza")
	})

	test("sem perfil (LEFT JOIN nulo) ou nome em branco, o aviso", () => {
		expect(displaySubmitterName(null)).toBe(MISSING_SUBMITTER_NAME)
		expect(displaySubmitterName(undefined)).toBe(MISSING_SUBMITTER_NAME)
		expect(displaySubmitterName("   ")).toBe(MISSING_SUBMITTER_NAME)
	})
})
