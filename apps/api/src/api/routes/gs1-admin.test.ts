import { describe, expect, test } from "bun:test"
import { isAllowedGpcUrl, mapVbgPayload } from "./gs1-admin.ts"

describe("isAllowedGpcUrl (anti-SSRF)", () => {
	test("aceita https em gs1.org e subdomínios", () => {
		expect(isAllowedGpcUrl("https://www.gs1.org/docs/gpc/publication.json")).toBe(true)
		expect(isAllowedGpcUrl("https://gpcbrowser.gs1.org/export.json")).toBe(true)
		expect(isAllowedGpcUrl("https://api.gs1br.org/gpc.json")).toBe(true)
	})

	test("rejeita http, hosts fora da allowlist e alvos internos", () => {
		expect(isAllowedGpcUrl("http://www.gs1.org/gpc.json")).toBe(false)
		expect(isAllowedGpcUrl("https://evil.com/gpc.json")).toBe(false)
		expect(isAllowedGpcUrl("https://notgs1.org/gpc.json")).toBe(false)
		expect(isAllowedGpcUrl("https://gs1.org.evil.com/gpc.json")).toBe(false)
		expect(isAllowedGpcUrl("https://169.254.169.254/latest/meta-data")).toBe(false)
		expect(isAllowedGpcUrl("https://localhost:8080/x")).toBe(false)
		expect(isAllowedGpcUrl("not a url")).toBe(false)
	})
})

describe("mapVbgPayload", () => {
	test("converte código UN/ECE para o catálogo canônico", () => {
		const mapped = mapVbgPayload({
			tradeItemDescription: "Arroz Tipo 1",
			brandName: "Marca X",
			netContent: { value: "5", measurementUnitCode: "KGM" },
		})
		expect(mapped.net_content).toBe(5)
		expect(mapped.net_content_unit).toBe("KG")
	})

	test("código de unidade desconhecido vira null (nunca viola a FK)", () => {
		const mapped = mapVbgPayload({ netContent: { value: 1, measurementUnitCode: "XYZ" } })
		expect(mapped.net_content_unit).toBeNull()
	})

	test("payload vazio produz colunas nulas", () => {
		const mapped = mapVbgPayload({})
		expect(mapped).toEqual({
			description: null,
			brand: null,
			net_content: null,
			net_content_unit: null,
			ncm: null,
			gpc_brick_code: null,
		})
	})
})
