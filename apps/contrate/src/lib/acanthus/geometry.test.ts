import { describe, expect, it } from "bun:test"
import { buildAcanthus } from "./geometry"

// Uma construção só para a suíte inteira: custa dezenas de ms.
const geometry = buildAcanthus()

describe("buildAcanthus", () => {
	it("gera uma nuvem densa, com arrays do tamanho da contagem", () => {
		// Densidade mínima para cobrir ~100 linhas de grade sem buracos.
		expect(geometry.count).toBeGreaterThan(20_000)
		expect(geometry.positions.length).toBe(geometry.count * 3)
		expect(geometry.normals.length).toBe(geometry.count * 3)
	})

	it("só tem valores finitos", () => {
		expect(geometry.positions.every(Number.isFinite)).toBe(true)
		expect(geometry.normals.every(Number.isFinite)).toBe(true)
	})

	it("tem normais unitárias", () => {
		const { normals, count } = geometry
		let worst = 0
		for (let i = 0; i < count; i++) {
			const x = normals[i * 3] ?? 0
			const y = normals[i * 3 + 1] ?? 0
			const z = normals[i * 3 + 2] ?? 0
			worst = Math.max(worst, Math.abs(Math.hypot(x, y, z) - 1))
		}
		expect(worst).toBeLessThan(1e-4)
	})

	it("fica centrada no eixo de rotação, e o raio declarado contém todos os pontos", () => {
		const { positions, count, radius, minY, maxY } = geometry
		let loX = Infinity
		let hiX = -Infinity
		let loZ = Infinity
		let hiZ = -Infinity
		let loY = Infinity
		let hiY = -Infinity
		for (let i = 0; i < count; i++) {
			const x = positions[i * 3] ?? 0
			const y = positions[i * 3 + 1] ?? 0
			const z = positions[i * 3 + 2] ?? 0
			expect(Math.hypot(x, z)).toBeLessThanOrEqual(radius + 1e-6)
			loX = Math.min(loX, x)
			hiX = Math.max(hiX, x)
			loY = Math.min(loY, y)
			hiY = Math.max(hiY, y)
			loZ = Math.min(loZ, z)
			hiZ = Math.max(hiZ, z)
		}
		expect(Math.abs(loX + hiX)).toBeLessThan(1e-3)
		expect(Math.abs(loZ + hiZ)).toBeLessThan(1e-3)
		expect(loY).toBeCloseTo(minY, 5)
		expect(hiY).toBeCloseTo(maxY, 5)
		expect(Math.abs(minY + maxY)).toBeLessThan(1e-3)
	})

	it("é uma folha em pé, simétrica, com relevo de verdade fora do plano", () => {
		const { positions, count } = geometry
		let loX = Infinity
		let hiX = -Infinity
		let loZ = Infinity
		let hiZ = -Infinity
		for (let i = 0; i < count; i++) {
			loX = Math.min(loX, positions[i * 3] ?? 0)
			hiX = Math.max(hiX, positions[i * 3] ?? 0)
			loZ = Math.min(loZ, positions[i * 3 + 2] ?? 0)
			hiZ = Math.max(hiZ, positions[i * 3 + 2] ?? 0)
		}
		const width = hiX - loX
		const height = geometry.maxY - geometry.minY
		const depth = hiZ - loZ
		// Mais alta que larga (uma folha, não um leque).
		expect(height).toBeGreaterThan(width)
		// De perfil a folha não vira uma linha: a profundidade é uma fração séria da largura.
		expect(depth).toBeGreaterThan(width * 0.3)
	})

	it("é determinística", () => {
		const again = buildAcanthus()
		expect(again.count).toBe(geometry.count)
		expect(again.positions).toEqual(geometry.positions)
	})

	it("amostra mais denso quando o espaçamento diminui", () => {
		const coarse = buildAcanthus({ spacing: 0.01 })
		expect(coarse.count).toBeLessThan(geometry.count / 4)
		expect(coarse.count).toBeGreaterThan(1000)
	})
})
