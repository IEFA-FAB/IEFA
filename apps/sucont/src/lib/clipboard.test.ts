import { describe, expect, it } from "bun:test"
import { type ClipboardWriter, copyText, copyWithFeedback } from "#/lib/clipboard"

/** Área de transferência cuja escrita só termina quando o teste manda. */
function deferredClipboard() {
	let settle: { resolve: () => void; reject: (e: unknown) => void } | null = null
	const written: string[] = []
	const clipboard: ClipboardWriter = {
		writeText: (text) =>
			new Promise<void>((resolve, reject) => {
				written.push(text)
				settle = { resolve, reject }
			}),
	}
	return {
		clipboard,
		written,
		resolve: () => settle?.resolve(),
		reject: () => settle?.reject(new Error("NotAllowedError")),
	}
}

describe("copyText", () => {
	it("resolve true depois da escrita", async () => {
		const fake = deferredClipboard()
		const outcome = copyText("msg", fake.clipboard)
		fake.resolve()
		expect(await outcome).toBe(true)
		expect(fake.written).toEqual(["msg"])
	})

	it("resolve false quando a escrita falha", async () => {
		const fake = deferredClipboard()
		const outcome = copyText("msg", fake.clipboard)
		fake.reject()
		expect(await outcome).toBe(false)
	})
})

describe("copyWithFeedback", () => {
	it("só marca como copiado depois de a escrita resolver", async () => {
		const fake = deferredClipboard()
		const copied: string[] = []
		let failures = 0
		const done = copyWithFeedback("msg", "ug:120001", { onCopied: (k) => copied.push(k), onFailed: () => failures++ }, fake.clipboard)
		await Promise.resolve()
		// A escrita ainda não terminou: nada de "Copiado".
		expect(copied).toEqual([])
		fake.resolve()
		await done
		expect(copied).toEqual(["ug:120001"])
		expect(failures).toBe(0)
	})

	it("na falha, avisa e não marca nada", async () => {
		const fake = deferredClipboard()
		const copied: string[] = []
		let failures = 0
		const done = copyWithFeedback("msg", "unica", { onCopied: (k) => copied.push(k), onFailed: () => failures++ }, fake.clipboard)
		fake.reject()
		await done
		expect(copied).toEqual([])
		expect(failures).toBe(1)
	})
})
