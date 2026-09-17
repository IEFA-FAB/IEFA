/**
 * Unit — reconhecimento de rajada do leitor.
 *
 * Os casos são os do mundo real: leitor rápido, leitor lento (sessão remota,
 * máquina velha), leitor que não manda terminador, leitor que manda Tab, e
 * gente digitando. Errar para o lado de "isto é leitura" é pior do que errar
 * para o lado oposto: uma rajada falsa engole o que a pessoa estava digitando.
 */

import { describe, expect, test } from "vitest"
import { type BurstConfig, closeOnIdle, EMPTY_BURST, feedKey, isStale } from "@/lib/scanner-burst"

const CONFIG: BurstConfig = { maxKeyIntervalMs: 80, minLength: 8, terminator: "enter", idleTimeoutMs: 120 }

/** Alimenta uma sequência com intervalo fixo e devolve o último resultado. */
function type(text: string, intervalMs: number, config: BurstConfig = CONFIG, terminator?: string) {
	let state = EMPTY_BURST
	let last = feedKey(state, { key: text[0] as string, timestamp: 1000 }, config)
	state = last.state
	for (let i = 1; i < text.length; i++) {
		last = feedKey(state, { key: text[i] as string, timestamp: 1000 + i * intervalMs }, config)
		state = last.state
	}
	if (terminator) {
		last = feedKey(state, { key: terminator, timestamp: 1000 + text.length * intervalMs }, config)
	}
	return last
}

describe("feedKey", () => {
	test("leitor rápido com Enter emite a leitura", () => {
		const outcome = type("7891234567895", 8, CONFIG, "Enter")
		expect(outcome.action).toBe("emit")
		expect(outcome.action === "emit" && outcome.value).toBe("7891234567895")
		expect(outcome.action === "emit" && outcome.preventDefault).toBe(true)
	})

	test("leitor lento dentro do limite calibrado ainda é leitura", () => {
		const outcome = type("7891234567895", 70, CONFIG, "Enter")
		expect(outcome.action === "emit" && outcome.value).toBe("7891234567895")
	})

	test("digitação humana não vira leitura: o buffer reinicia a cada tecla", () => {
		const outcome = type("78912345", 300, CONFIG, "Enter")
		// cada tecla ficou fora da janela de rajada, então só a última sobrou
		expect(outcome.action).toBe("reset")
	})

	test("Enter sozinho não emite nada", () => {
		const outcome = feedKey(EMPTY_BURST, { key: "Enter", timestamp: 1000 }, CONFIG)
		expect(outcome.action).toBe("reset")
	})

	test("leitura curta com terminador é descartada", () => {
		const outcome = type("123", 8, CONFIG, "Enter")
		expect(outcome.action).toBe("reset")
	})

	test("EAN-8 passa com o mínimo de 8", () => {
		const outcome = type("40170725", 8, CONFIG, "Enter")
		expect(outcome.action === "emit" && outcome.value).toBe("40170725")
	})

	test("terminador Tab quando o leitor manda Tab", () => {
		const config: BurstConfig = { ...CONFIG, terminator: "tab" }
		const outcome = type("7891234567895", 8, config, "Tab")
		expect(outcome.action === "emit" && outcome.value).toBe("7891234567895")
		expect(outcome.action === "emit" && outcome.preventDefault).toBe(true)
	})

	test("Enter não é terminador quando o leitor manda Tab", () => {
		const config: BurstConfig = { ...CONFIG, terminator: "tab" }
		const outcome = type("7891234567895", 8, config, "Enter")
		expect(outcome.action).toBe("ignore")
	})

	test("atalho de teclado é ignorado", () => {
		const outcome = feedKey(EMPTY_BURST, { key: "s", timestamp: 1000, withModifier: true }, CONFIG)
		expect(outcome.action).toBe("ignore")
	})

	test("tecla não imprimível no meio da rajada é ignorada sem zerar o buffer", () => {
		let state = EMPTY_BURST
		for (const [i, char] of [..."78912345"].entries()) {
			state = feedKey(state, { key: char, timestamp: 1000 + i * 8 }, CONFIG).state
		}
		const shift = feedKey(state, { key: "Shift", timestamp: 1070 }, CONFIG)
		expect(shift.action).toBe("ignore")
		expect(shift.state.buffer).toBe("78912345")
	})

	test("GS1 com separador chega inteiro no buffer", () => {
		const raw = "01078912345678951726033110L4521"
		const outcome = type(raw, 6, CONFIG, "Enter")
		expect(outcome.action === "emit" && outcome.value).toBe(raw)
	})
})

describe("closeOnIdle", () => {
	const noTerminator: BurstConfig = { ...CONFIG, terminator: "none" }

	test("leitor sem terminador fecha por tempo", () => {
		const outcome = type("7891234567895", 8, noTerminator)
		expect(outcome.action).toBe("buffer")
		expect(closeOnIdle(outcome.state, noTerminator)).toBe("7891234567895")
	})

	test("buffer curto não fecha", () => {
		const outcome = type("123", 8, noTerminator)
		expect(closeOnIdle(outcome.state, noTerminator)).toBeNull()
	})
})

describe("isStale", () => {
	test("rajada abandonada é descartada", () => {
		const outcome = type("78912", 8, CONFIG)
		expect(isStale(outcome.state, outcome.state.lastKeyAt + 500, CONFIG)).toBe(false)
		expect(isStale(outcome.state, outcome.state.lastKeyAt + 2000, CONFIG)).toBe(true)
	})

	test("buffer vazio nunca é obsoleto", () => {
		expect(isStale(EMPTY_BURST, 99_999, CONFIG)).toBe(false)
	})
})
