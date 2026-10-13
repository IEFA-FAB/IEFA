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
		expect(readSaramDismissal()).toBeNull()
		rememberSaramDismissal("no_match")
		// É a leitura que cada nova montagem do aviso faz — nove rotas do hub, nove
		// montagens, e nenhuma delas pode reabrir o aviso já dispensado. O estado vai junto:
		// se ele muda, o aviso volta.
		expect(readSaramDismissal()).toBe("no_match")
	})

	test("logout esquece a dispensa", () => {
		withWindow()
		rememberSaramDismissal("no_match")
		forgetSaramDismissal()
		expect(readSaramDismissal()).toBeNull()
	})

	// O módulo é compartilhado entre requisições no servidor: um estado deixado por
	// uma sessão calaria o pedido na renderização da seguinte.
	test("no servidor nunca dispensa, nem depois de alguém ter dispensado", () => {
		withWindow()
		rememberSaramDismissal("no_match")
		withoutWindow()
		expect(readSaramDismissal()).toBeNull()
	})

	test("gravar no servidor não contamina o cliente", () => {
		withoutWindow()
		rememberSaramDismissal("no_match")
		withWindow()
		expect(readSaramDismissal()).toBeNull()
	})
})
