import { afterEach, describe, expect, test, vi } from "vitest"
import { escapeHtml, sendSecurityNotice } from "./security-email.server"

describe("aviso de chave a vencer", () => {
	afterEach(() => {
		vi.unstubAllEnvs()
		vi.unstubAllGlobals()
	})

	test("escapeHtml neutraliza marcação", () => {
		expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;")
	})

	test("o rótulo digitado pelo titular não vira HTML no e-mail", async () => {
		vi.stubEnv("SISUB_RESEND_API_KEY", "test-key")
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }))
		vi.stubGlobal("fetch", fetchMock)

		const sent = await sendSecurityNotice({
			to: "titular@example.com",
			kind: "mcp-key-expiring",
			details: { label: '<a href="https://phish.example">Clique</a>', expiresAt: new Date("2026-10-01T12:00:00Z") },
		})

		expect(sent).toBe(true)
		const html = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).html as string
		expect(html).not.toContain('<a href="https://phish.example">')
		expect(html).toContain("&lt;a href=&quot;https://phish.example&quot;&gt;Clique&lt;/a&gt;")
	})
})
