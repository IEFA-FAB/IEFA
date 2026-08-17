import { describe, expect, test } from "bun:test"
import { clientIpFromForwardedFor } from "./client-ip.ts"
import { formatEffectiveDate } from "./format.ts"

describe("clientIpFromForwardedFor", () => {
	test("pega o último elemento — o que o ALB acrescentou, não o que o cliente escreveu", () => {
		// O primeiro elemento é texto arbitrário do cliente. Gravá-lo como evidência
		// deixaria o titular escolher qual IP consta do próprio registro de ciência.
		expect(clientIpFromForwardedFor("1.2.3.4, 203.0.113.9")).toBe("203.0.113.9")
	})

	test("cadeia de um elemento", () => {
		expect(clientIpFromForwardedFor("203.0.113.9")).toBe("203.0.113.9")
	})

	test("`unknown` do Squid vira null em vez de derrubar o insert", () => {
		// Sem isso o Postgres levanta 22P02 na coluna INET e o "Estou ciente" passa a
		// responder 500 para sempre naquele cliente.
		expect(clientIpFromForwardedFor("unknown")).toBeNull()
		expect(clientIpFromForwardedFor("203.0.113.9, unknown")).toBeNull()
	})

	test("lixo e vazio viram null", () => {
		expect(clientIpFromForwardedFor(null)).toBeNull()
		expect(clientIpFromForwardedFor(undefined)).toBeNull()
		expect(clientIpFromForwardedFor("")).toBeNull()
		expect(clientIpFromForwardedFor("  ,  ")).toBeNull()
		expect(clientIpFromForwardedFor("999.1.1.1")).toBeNull()
		expect(clientIpFromForwardedFor("'; drop table x --")).toBeNull()
	})

	test("prefixo CIDR é rejeitado — INET aceitaria a faixa", () => {
		expect(clientIpFromForwardedFor("203.0.113.0/24")).toBeNull()
	})

	test("IPv6, com e sem colchetes", () => {
		expect(clientIpFromForwardedFor("2001:db8::1")).toBe("2001:db8::1")
		expect(clientIpFromForwardedFor("[2001:db8::1]:443")).toBe("2001:db8::1")
	})

	test("IPv4 com porta perde a porta", () => {
		expect(clientIpFromForwardedFor("203.0.113.9:51234")).toBe("203.0.113.9")
	})
})

describe("formatEffectiveDate", () => {
	test("a data de calendário não desliza de fuso", () => {
		// `new Date("2026-08-16")` é meia-noite UTC; renderizada em America/Sao_Paulo
		// sem `timeZone: "UTC"` vira 15 de agosto, e a vigência publicada fica um dia
		// antes da real para todo usuário brasileiro.
		const original = process.env.TZ
		process.env.TZ = "America/Sao_Paulo"
		try {
			expect(formatEffectiveDate("2026-08-16", "pt-BR")).toContain("16")
			expect(formatEffectiveDate("2026-08-16", "pt-BR")).toContain("agosto")
		} finally {
			process.env.TZ = original
		}
	})

	test("mesma saída independentemente do fuso do processo (SSR x navegador)", () => {
		expect(formatEffectiveDate("2026-01-01", "pt-BR")).toBe(
			new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(new Date("2026-01-01"))
		)
	})

	test("locale en-US", () => {
		expect(formatEffectiveDate("2026-08-16", "en-US")).toContain("16")
	})
})
