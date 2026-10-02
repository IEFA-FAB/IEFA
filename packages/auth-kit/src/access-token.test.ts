import { describe, expect, it } from "bun:test"
import type { SupabaseClient } from "@supabase/supabase-js"
import { readAccessToken } from "./access-token.ts"

function clientWith(getSession: () => Promise<unknown>) {
	return { auth: { getSession } } as unknown as SupabaseClient
}

describe("readAccessToken", () => {
	it("devolve o access token da sessão corrente", async () => {
		const client = clientWith(async () => ({ data: { session: { access_token: "tok" } } }))
		expect(await readAccessToken(client)).toBe("tok")
	})

	it("sem sessão devolve undefined", async () => {
		const client = clientWith(async () => ({ data: { session: null } }))
		expect(await readAccessToken(client)).toBeUndefined()
	})

	it("renovação pendurada não prende a chamada: passa do teto e devolve undefined", async () => {
		const client = clientWith(() => new Promise(() => {}))
		expect(await readAccessToken(client, 5)).toBeUndefined()
	})
})
