import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { loadSessionId, saveSessionId } from "./chat-session"

const USER = "u1"
const KEY = `rada_session_id:${USER}`
const SESSION = "3f1c2a4e-9b7d-4e21-8c3a-5d6f7a8b9c0d"

describe("sessão guardada no navegador", () => {
	const original = (globalThis as { localStorage?: unknown }).localStorage
	let store: Map<string, string>

	beforeEach(() => {
		store = new Map()
		;(globalThis as { localStorage?: unknown }).localStorage = {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v),
			removeItem: (k: string) => void store.delete(k),
		}
	})
	afterEach(() => {
		;(globalThis as { localStorage?: unknown }).localStorage = original
	})

	it("devolve o UUID guardado", () => {
		saveSessionId(USER, SESSION)
		expect(loadSessionId(USER)).toBe(SESSION)
	})

	it("descarta valor fora do formato na leitura, e o apaga", () => {
		// Corrompido ou adulterado, ele virava chamada autenticada ao α a cada abertura da tela.
		store.set(KEY, "..")
		expect(loadSessionId(USER)).toBeNull()
		expect(store.has(KEY)).toBe(false)
	})

	it("não grava valor fora do formato", () => {
		saveSessionId(USER, "../chunks")
		expect(store.has(KEY)).toBe(false)
	})
})
