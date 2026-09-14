/**
 * Limiar de memória do `/health`.
 *
 * A regra que estes testes seguram: o limiar acompanha o tamanho REAL da task. Com o número
 * fixo antigo, dobrar a memória da task não mudava nada — o ALB tirava a task da rotação nos
 * mesmos 900 MB. E metadado ausente ou malformado nunca vira limite inventado: cai no fallback.
 */

import { describe, expect, test } from "vitest"
import { FALLBACK_LIMIT_MIB, memoryThresholdBytes, parseTaskMemoryLimitMiB } from "./task-memory-limit"

const MIB = 1024 * 1024

describe("parseTaskMemoryLimitMiB", () => {
	test("lê Limits.Memory do /task do ECS", () => {
		expect(parseTaskMemoryLimitMiB({ Cluster: "x", Limits: { CPU: 0.5, Memory: 2048 } })).toBe(2048)
	})

	test("forma inesperada devolve null, não um número qualquer", () => {
		expect(parseTaskMemoryLimitMiB(null)).toBeNull()
		expect(parseTaskMemoryLimitMiB("2048")).toBeNull()
		expect(parseTaskMemoryLimitMiB({})).toBeNull()
		expect(parseTaskMemoryLimitMiB({ Limits: null })).toBeNull()
		expect(parseTaskMemoryLimitMiB({ Limits: { Memory: "2048" } })).toBeNull()
		expect(parseTaskMemoryLimitMiB({ Limits: { Memory: 0 } })).toBeNull()
		expect(parseTaskMemoryLimitMiB({ Limits: { Memory: Number.NaN } })).toBeNull()
	})
})

describe("memoryThresholdBytes", () => {
	test("é 90% do limite da task — e sobe junto quando a task cresce", () => {
		expect(memoryThresholdBytes(1024)).toBe(Math.floor(1024 * MIB * 0.9))
		expect(memoryThresholdBytes(2048)).toBe(Math.floor(2048 * MIB * 0.9))
		expect(memoryThresholdBytes(2048)).toBeGreaterThan(memoryThresholdBytes(1024))
	})

	test("sem limite conhecido usa o fallback — o mesmo ~900 MB de antes", () => {
		expect(memoryThresholdBytes(null)).toBe(Math.floor(FALLBACK_LIMIT_MIB * MIB * 0.9))
		expect(Math.round(memoryThresholdBytes(null) / MIB)).toBe(900)
	})
})
