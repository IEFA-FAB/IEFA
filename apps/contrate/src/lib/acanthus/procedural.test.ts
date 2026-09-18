import { describe, expect, it } from "bun:test"
import { createProceduralScene } from "./procedural"
import { fitView, type View } from "./raster"

const COLS = 158
const ROWS = 107
const CELL_W = 10
const CELL_H = 16

function renderAt(yaw: number) {
	const scene = createProceduralScene()
	scene.resize(COLS, ROWS)
	const glyph = new Uint8Array(COLS * ROWS)
	const tone = new Uint8Array(COLS * ROWS)
	const view: View = { yaw, pitch: scene.pitch, cellW: CELL_W, cellH: CELL_H, ...fitView(scene.bounds, COLS * CELL_W, ROWS * CELL_H) }
	scene.render(view, glyph, tone)
	return { glyph, tone }
}

describe("createProceduralScene", () => {
	it("a volta inteira é legível: a folha a 180° não repete a folha a 0°", () => {
		// Bug do mantenedor: com a folha simétrica e o avesso sombreado igual à
		// frente, a segunda metade da volta parecia a primeira de novo ("gira 180° e reseta").
		const front = renderAt(0).glyph
		const back = renderAt(Math.PI).glyph
		let nonBlank = 0
		let differ = 0
		for (let i = 0; i < front.length; i++) {
			if (!front[i] && !back[i]) continue
			nonBlank++
			if (front[i] !== back[i]) differ++
		}
		expect(nonBlank).toBeGreaterThan(1000)
		expect(differ / nonBlank).toBeGreaterThan(0.3)
	})

	it("o avesso é mais apagado que a frente", () => {
		const mean = (glyph: Uint8Array) => {
			let sum = 0
			let n = 0
			for (const g of glyph) {
				if (!g) continue
				sum += g
				n++
			}
			return sum / n
		}
		expect(mean(renderAt(Math.PI).glyph)).toBeLessThan(mean(renderAt(0).glyph) * 0.85)
	})

	it("não é espelhada: a vista a 90° difere da vista a 270°", () => {
		const right = renderAt(Math.PI / 2).glyph
		const left = renderAt((3 * Math.PI) / 2).glyph
		let nonBlank = 0
		let differ = 0
		for (let i = 0; i < right.length; i++) {
			if (!right[i] && !left[i]) continue
			nonBlank++
			if (right[i] !== left[i]) differ++
		}
		expect(differ / nonBlank).toBeGreaterThan(0.3)
	})
})
