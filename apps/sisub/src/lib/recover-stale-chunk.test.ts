import { beforeEach, describe, expect, it, vi } from "vitest"
import { reportError } from "@/lib/observability/report-error"
import { importChunkOrNull, isStaleChunkError } from "./recover-stale-chunk"

vi.mock("@/lib/observability/report-error", () => ({ reportError: vi.fn() }))

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

/**
 * Terceiro feitio do chunk obsoleto: o `__vitePreload` do Vite engole a falha
 * quando o listener de `vite:preloadError` dá `preventDefault()` (o que a nossa
 * recuperação faz antes de recarregar), e o `import()` RESOLVE com `undefined`.
 * Sem o guard, todo call-site que destrutura o módulo estoura TypeError e
 * reporta falha de feature numa página que já está recarregando.
 */
describe("importChunkOrNull", () => {
	beforeEach(() => {
		vi.mocked(reportError).mockClear()
	})

	it("devolve o módulo quando o chunk carrega", async () => {
		const mod = { downloadCardapioDocx: () => {} }
		await expect(importChunkOrNull(() => Promise.resolve(mod))).resolves.toBe(mod)
		expect(reportError).not.toHaveBeenCalled()
	})

	it("devolve null quando o import resolve vazio (chunk obsoleto)", async () => {
		await expect(importChunkOrNull(() => Promise.resolve(undefined))).resolves.toBeNull()
		await expect(importChunkOrNull(() => Promise.resolve(null))).resolves.toBeNull()
	})

	// O call-site trata `null` saindo quieto. Se o módulo vier vazio sem reload em
	// andamento, esse silêncio vira clique morto — então o caso precisa aparecer no
	// Faro em vez de sumir. (Sem reload disparado neste processo de teste, é sempre
	// este o ramo: `recoveryInFlight` continua false.)
	it("reporta o vazio inesperado, quando nenhuma recuperação está em andamento", async () => {
		await importChunkOrNull(() => Promise.resolve(undefined))

		expect(reportError).toHaveBeenCalledTimes(1)
		const [error, context] = vi.mocked(reportError).mock.calls[0]
		expect((error as Error).message).toMatch(/resolveu vazio sem recuperação/i)
		expect(context).toMatchObject({ source: "stale-chunk", reason: "empty-module-no-recovery" })
	})

	it("propaga rejeição — falha real segue para o tratamento do call-site", async () => {
		const boom = new Error("Failed to fetch dynamically imported module")
		await expect(importChunkOrNull(() => Promise.reject(boom))).rejects.toBe(boom)
		expect(reportError).not.toHaveBeenCalled()
	})
})
