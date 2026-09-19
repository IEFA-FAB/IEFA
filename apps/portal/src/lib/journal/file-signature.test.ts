import { describe, expect, it } from "bun:test"
import { hasFileSignature, matchesFileSignature, SIGNATURE_PROBE_BYTES } from "./file-signature"
import { ALLOWED_EXTENSIONS } from "./storage-paths"

const bytes = (text: string) => new TextEncoder().encode(text)

describe("matchesFileSignature", () => {
	it("aceita o começo real de cada formato binário", () => {
		expect(matchesFileSignature("pdf", bytes("%PDF-1.7\n"))).toBe(true)
		expect(matchesFileSignature("zip", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toBe(true)
		expect(matchesFileSignature("zip", new Uint8Array([0x50, 0x4b, 0x05, 0x06]))).toBe(true)
		expect(matchesFileSignature("png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true)
		expect(matchesFileSignature("jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true)
		expect(matchesFileSignature("JPEG", new Uint8Array([0xff, 0xd8, 0xff, 0xdb]))).toBe(true)
	})

	it("recusa SVG/HTML gravado com nome de PDF, e arquivo vazio ou truncado", () => {
		expect(matchesFileSignature("pdf", bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBe(false)
		expect(matchesFileSignature("pdf", bytes("<!DOCTYPE html>"))).toBe(false)
		expect(matchesFileSignature("pdf", bytes(" %PDF-1.7"))).toBe(false)
		expect(matchesFileSignature("pdf", new Uint8Array(0))).toBe(false)
		expect(matchesFileSignature("pdf", bytes("%PD"))).toBe(false)
		expect(matchesFileSignature("zip", bytes("%PDF-1.7"))).toBe(false)
		expect(matchesFileSignature("png", bytes("<svg/>"))).toBe(false)
	})

	it("texto sem assinatura (.typ/.csv) não é conferido aqui", () => {
		expect(hasFileSignature("typ")).toBe(false)
		expect(hasFileSignature("csv")).toBe(false)
		expect(matchesFileSignature("csv", bytes("a,b\n1,2"))).toBe(true)
	})

	it("toda extensão binária da lista de upload tem assinatura e cabe na sonda", () => {
		for (const extension of new Set(Object.values(ALLOWED_EXTENSIONS).flat())) {
			if (extension === "typ" || extension === "csv") continue
			expect(`${extension}: ${hasFileSignature(extension)}`).toBe(`${extension}: true`)
		}
		expect(SIGNATURE_PROBE_BYTES).toBe(8)
	})
})
