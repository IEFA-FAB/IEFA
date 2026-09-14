import { describe, expect, test } from "vitest"
import { FARO_IGNORE_ERRORS } from "./faro-ignore-errors"

/**
 * Reproduz o que o Faro faz com um erro de `window.onerror` sem objeto de erro
 * (caso do ResizeObserver e do "Script error."): `registerOnerror` embrulha a
 * mensagem em `new Error(value)` e o `isErrorIgnored` do faro-core casa os padrões
 * contra `message + " " + name + " " + stack` — nunca contra a mensagem sozinha.
 */
function isIgnoredByFaro(message: string): boolean {
	const error = new Error(message)
	const subject = `${error.message} ${error.name} ${error.stack}`
	return FARO_IGNORE_ERRORS.some((pattern) => pattern.test(subject))
}

describe("FARO_IGNORE_ERRORS", () => {
	test.each([
		"ResizeObserver loop completed with undelivered notifications",
		"ResizeObserver loop completed with undelivered notifications.",
		"ResizeObserver loop limit exceeded",
		"Script error.",
	])("descarta ruído do browser: %s", (message) => {
		expect(isIgnoredByFaro(message)).toBe(true)
	})

	test("descarta erro cuja stack vem de extensão do navegador", () => {
		const error = new Error("boom")
		error.stack = "Error: boom\n    at chrome-extension://abcdef/content.js:1:1"
		const subject = `${error.message} ${error.name} ${error.stack}`
		expect(FARO_IGNORE_ERRORS.some((pattern) => pattern.test(subject))).toBe(true)
	})

	test.each(["Cannot read properties of undefined (reading 'id')", "Falha ao processar ResizeObserver loop completed with undelivered notifications"])(
		"mantém erro real da aplicação: %s",
		(message) => {
			expect(isIgnoredByFaro(message)).toBe(false)
		}
	)

	test("nenhum padrão ancora no fim — o Faro sempre anexa nome e stack depois da mensagem", () => {
		for (const pattern of FARO_IGNORE_ERRORS) {
			expect(pattern.source.endsWith("$")).toBe(false)
		}
	})
})
