import { describe, expect, it } from "vitest"
import { isStaleChunkError } from "./recover-stale-chunk"

/**
 * A detecção é por mensagem porque é só isso que chega no `defaultOnCatch` do
 * router. Cada engine descreve o mesmo TypeError do `lazyRouteComponent` de um
 * jeito, então as três formas precisam estar cobertas — um engine de fora
 * significa usuário travado numa tela de erro em vez de um reload.
 */
describe("isStaleChunkError", () => {
	it("detecta import dinâmico que falha de vez, nos três engines", () => {
		expect(isStaleChunkError(new Error("Importing a module script failed."))).toBe(true)
		expect(isStaleChunkError(new Error("Failed to fetch dynamically imported module: https://sisub.iefa.com.br/assets/auth-Ab12Cd34.js"))).toBe(true)
		expect(isStaleChunkError(new Error("error loading dynamically imported module"))).toBe(true)
	})

	it("detecta import que resolve para módulo vazio no V8", () => {
		expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'component')"))).toBe(true)
		expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'errorComponent')"))).toBe(true)
		expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'default')"))).toBe(true)
	})

	it("detecta import que resolve para módulo vazio no Spidermonkey", () => {
		expect(isStaleChunkError(new TypeError("res is undefined"))).toBe(true)
	})

	// Regressão: a forma do WebKit passava batido, e é o engine do iOS Safari —
	// o caso que motivou toda a recuperação (aba/PWA viva atravessando deploy).
	it("detecta import que resolve para módulo vazio no WebKit", () => {
		expect(isStaleChunkError(new TypeError("undefined is not an object (evaluating 'e[n??`default`]')"))).toBe(true)
		expect(isStaleChunkError(new TypeError("undefined is not an object (evaluating 'res[exportName ?? \"default\"]')"))).toBe(true)
		expect(isStaleChunkError(new TypeError("null is not an object (evaluating 'e[n??`default`]')"))).toBe(true)
	})

	it("aceita mensagem já prefixada pela instrumentação de console do Faro", () => {
		expect(isStaleChunkError(new TypeError("console.error: undefined is not an object (evaluating 'e[n??`default`]')"))).toBe(true)
	})

	it("ignora erro de app que não é chunk obsoleto", () => {
		expect(isStaleChunkError(new TypeError("undefined is not an object (evaluating 'user.email')"))).toBe(false)
		expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'kitchenId')"))).toBe(false)
		expect(isStaleChunkError(new Error("Failed to fetch"))).toBe(false)
		expect(isStaleChunkError(undefined)).toBe(false)
		expect(isStaleChunkError(null)).toBe(false)
	})
})
