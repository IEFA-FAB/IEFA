import { afterEach, describe, expect, test } from "bun:test"
import { forgetSaramDismissal, readSaramDismissal, rememberSaramDismissal } from "#/lib/saram-dismissal"

const originalWindow = globalThis.window

function withoutWindow() {
	Reflect.deleteProperty(globalThis, "window")
}

function withWindow() {
	Object.defineProperty(globalThis, "window", { configurable: true, value: {} })
}

afterEach(() => {
	if (originalWindow === undefined) withoutWindow()
	else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow })
	forgetSaramDismissal()
})

describe("saram-dismissal", () => {
	test("dispensa atravessa a remontagem do HubLayout", () => {
		withWindow()
		expect(readSaramDismissal()).toBe(false)
		rememberSaramDismissal()
		// É a leitura que cada nova montagem do diálogo faz — nove rotas do hub, nove
		// montagens, e nenhuma delas pode reabrir o pedido já dispensado.
		expect(readSaramDismissal()).toBe(true)
	})

	test("logout esquece a dispensa", () => {
		withWindow()
		rememberSaramDismissal()
		forgetSaramDismissal()
		expect(readSaramDismissal()).toBe(false)
	})

	// O módulo é compartilhado entre requisições no servidor: um `true` deixado por
	// uma sessão calaria o pedido na renderização da seguinte.
	test("no servidor nunca dispensa, nem depois de alguém ter dispensado", () => {
		withWindow()
		rememberSaramDismissal()
		withoutWindow()
		expect(readSaramDismissal()).toBe(false)
	})

	test("gravar no servidor não contamina o cliente", () => {
		withoutWindow()
		rememberSaramDismissal()
		withWindow()
		expect(readSaramDismissal()).toBe(false)
	})
})
