import { describe, expect, test } from "vitest"
import { type ElevationAuthClient, syncElevatedSession } from "@/lib/assurance/session-elevation"

/** Access token de mentira, com o payload REAL: é a claim `aal` que este módulo lê. */
function token(aal: "aal1" | "aal2"): string {
	const payload = Buffer.from(JSON.stringify({ sub: "user-1", aal, amr: [{ method: "totp", timestamp: 1_789_137_375 }] })).toString("base64url")
	return `header.${payload}.signature`
}

type Call = "getSession" | "setSession" | "refreshSession"

function fakeAuth(options: {
	stored: "aal1" | "aal2" | null
	refreshed?: "aal1" | "aal2" | null
	setSessionFails?: boolean
	refreshFails?: boolean
	storedAccessToken?: string
}): ElevationAuthClient & { calls: Call[]; adopted: { access_token: string; refresh_token: string } | null } {
	const calls: Call[] = []
	let adopted: { access_token: string; refresh_token: string } | null = null

	return {
		calls,
		get adopted() {
			return adopted
		},
		async getSession() {
			calls.push("getSession")
			if (options.stored === null) return { data: { session: null } }
			return { data: { session: { access_token: options.storedAccessToken ?? token(options.stored), refresh_token: "refresh-novo" } } }
		},
		async setSession(tokens) {
			calls.push("setSession")
			if (options.setSessionFails) throw new Error("storage indisponível")
			adopted = tokens
			return { data: {}, error: null }
		},
		async refreshSession() {
			calls.push("refreshSession")
			if (options.refreshFails) throw new Error("Invalid Refresh Token: Already Used")
			if (!options.refreshed) return { data: { session: null } }
			return { data: { session: { access_token: token(options.refreshed), refresh_token: "refresh-mais-novo" } } }
		},
	}
}

describe("syncElevatedSession", () => {
	test("cookie já elevado: adota o par novo e NÃO renova nada", async () => {
		const auth = fakeAuth({ stored: "aal2" })

		await expect(syncElevatedSession(auth)).resolves.toBe("elevated")
		// Renovar aqui seria pedir ao GoTrue um par que já está na mão — e gastar o refresh
		// token que o servidor acabou de rodar.
		expect(auth.calls).toEqual(["getSession", "setSession"])
		expect(auth.adopted).toEqual({ access_token: token("aal2"), refresh_token: "refresh-novo" })
	})

	test("adotar é o que impede a sessão de cair sozinha depois — mas falhar nisso não invalida o reenvio", async () => {
		const auth = fakeAuth({ stored: "aal2", setSessionFails: true })

		// O servidor lê o COOKIE no reenvio, e ele já está elevado.
		await expect(syncElevatedSession(auth)).resolves.toBe("elevated")
	})

	test("cookie ainda em AAL1: renova e reavalia", async () => {
		const auth = fakeAuth({ stored: "aal1", refreshed: "aal2" })

		await expect(syncElevatedSession(auth)).resolves.toBe("elevated")
		expect(auth.calls).toEqual(["getSession", "refreshSession"])
	})

	test("renovou e continua em AAL1: não reenvia — seria barrado de novo", async () => {
		const auth = fakeAuth({ stored: "aal1", refreshed: "aal1" })
		await expect(syncElevatedSession(auth)).resolves.toBe("not-elevated")
	})

	test("refresh token já rodado pelo servidor não derruba a tela, vira veredito legível", async () => {
		const auth = fakeAuth({ stored: "aal1", refreshFails: true })
		await expect(syncElevatedSession(auth)).resolves.toBe("not-elevated")
	})

	test("sem sessão no client não há o que adotar", async () => {
		const auth = fakeAuth({ stored: null })

		await expect(syncElevatedSession(auth)).resolves.toBe("no-session")
		expect(auth.calls).toEqual(["getSession"])
	})

	test("token ilegível é tratado como não elevado — falha FECHADA, igual ao servidor", async () => {
		const auth = fakeAuth({ stored: "aal2", storedAccessToken: "isto-não-é-um-jwt", refreshed: null })

		await expect(syncElevatedSession(auth)).resolves.toBe("not-elevated")
		expect(auth.calls).toEqual(["getSession", "refreshSession"])
	})
})
