import { describe, expect, test } from "bun:test"
import { fetchEmailsFromAuth, withAuthEmails } from "./access-read.server"
import { createTtlCache } from "./concurrency"

/** Um GoTrue de mentira: conta as chamadas e o pico de paralelismo, e falha para `erro`. */
function fakeCore(emails: Record<string, string>) {
	const calls: string[] = []
	let active = 0
	let peak = 0
	const core = {
		auth: {
			admin: {
				getUserById: async (id: string) => {
					calls.push(id)
					active++
					peak = Math.max(peak, active)
					await Bun.sleep(2)
					active--
					if (id === "erro") return { data: { user: null }, error: { message: "falhou" } }
					return { data: { user: { email: emails[id] ?? null } }, error: null }
				},
			},
		},
	}
	// biome-ignore lint/suspicious/noExplicitAny: cliente falso só com o que a função usa
	return { core: core as any, calls, peak: () => peak }
}

describe("e-mail pelo GoTrue", () => {
	test("paralelismo com teto (5) e cache: a segunda busca não chama de novo", async () => {
		const ids = Array.from({ length: 12 }, (_, i) => `u${i}`)
		const { core, calls, peak } = fakeCore(Object.fromEntries(ids.map((id) => [id, `${id}@fab.mil.br`])))
		const cache = createTtlCache<string>({ ttlMs: 60_000, maxEntries: 100 })

		const first = await fetchEmailsFromAuth(core, ids, cache)
		expect(first.get("u3")).toBe("u3@fab.mil.br")
		expect(peak()).toBeLessThanOrEqual(5)
		expect(calls).toHaveLength(12)

		await fetchEmailsFromAuth(core, ids, cache)
		expect(calls).toHaveLength(12)
	})

	test("conta sem e-mail fica no cache; falha não fica (tenta de novo)", async () => {
		const { core, calls } = fakeCore({})
		const cache = createTtlCache<string>({ ttlMs: 60_000, maxEntries: 100 })
		expect((await fetchEmailsFromAuth(core, ["sem", "erro"], cache)).size).toBe(0)
		await fetchEmailsFromAuth(core, ["sem", "erro"], cache)
		expect(calls.filter((id) => id === "sem")).toHaveLength(1)
		expect(calls.filter((id) => id === "erro")).toHaveLength(2)
	})

	test("withAuthEmails só pergunta por quem veio sem e-mail", async () => {
		const { core, calls } = fakeCore({ x1: "x1@fab.mil.br" })
		const rows = await withAuthEmails(core, [
			{ userId: "x1-sem-cache", email: "" },
			{ userId: "x2", email: "x2@fab.mil.br" },
		])
		expect(rows[1]).toEqual({ userId: "x2", email: "x2@fab.mil.br" })
		expect(calls).toEqual(["x1-sem-cache"])
	})
})
