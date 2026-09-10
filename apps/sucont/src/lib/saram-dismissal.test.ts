import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { forgetSaramDismissal, readSaramDismissal, rememberSaramDismissal } from "#/lib/saram-dismissal"

const KEY = "sucont:saram-dismissed"

/** Mínimo de `Storage` que os três helpers tocam. */
function fakeStorage(): Storage {
	const map = new Map<string, string>()
	return {
		getItem: (k) => map.get(k) ?? null,
		setItem: (k, v) => void map.set(k, v),
		removeItem: (k) => void map.delete(k),
		clear: () => map.clear(),
		key: (i) => [...map.keys()][i] ?? null,
		get length() {
			return map.size
		},
	} as Storage
}

const originalWindow = globalThis.window

function installWindow(sessionStorage: Storage | (() => never)) {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: typeof sessionStorage === "function" ? Object.defineProperty({}, "sessionStorage", { get: sessionStorage }) : { sessionStorage },
	})
}

beforeEach(() => installWindow(fakeStorage()))
afterEach(() => {
	if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window")
	else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow })
})

describe("saram-dismissal", () => {
	test("dispensa atravessa a remontagem do HubLayout", () => {
		expect(readSaramDismissal()).toBe(false)
		rememberSaramDismissal()
		// É a leitura que cada nova montagem do diálogo faz — nove rotas, nove
		// montagens, e nenhuma delas pode reabrir o pedido já dispensado.
		expect(readSaramDismissal()).toBe(true)
	})

	test("logout esquece a dispensa", () => {
		rememberSaramDismissal()
		forgetSaramDismissal()
		expect(readSaramDismissal()).toBe(false)
	})

	test("valor estranho no armazenamento não conta como dispensa", () => {
		window.sessionStorage.setItem(KEY, "sim")
		expect(readSaramDismissal()).toBe(false)
	})

	// Sem `window` (SSR) e com armazenamento bloqueado o resultado é o mesmo: não
	// dispensado. Pedir de novo é o pior caso aceitável; engolir a exceção na carga
	// da tela não é.
	test("SSR não dispensa e não quebra", () => {
		Reflect.deleteProperty(globalThis, "window")
		expect(readSaramDismissal()).toBe(false)
	})

	test("armazenamento bloqueado não propaga exceção", () => {
		installWindow(() => {
			throw new Error("SecurityError")
		})
		expect(readSaramDismissal()).toBe(false)
		expect(() => rememberSaramDismissal()).not.toThrow()
		expect(() => forgetSaramDismissal()).not.toThrow()
	})
})
