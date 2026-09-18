import { describe, expect, it } from "bun:test"
import { buildAcanthus } from "./geometry"
import { cellHeightFor } from "./procedural"
import { carveOcclusionEdges, createRaster, fitView, LUMINANCE_RAMP, rampIndex, rasterize, rasterToText } from "./raster"

const geometry = buildAcanthus()

// Grade do tamanho da hero: caixa de ~790×860 px CSS a DPR 2.
const COLS = 158
const ROWS = 107
const CELL_W = 10
const CELL_H = 16

function renderAt(yaw: number) {
	const raster = createRaster(COLS, ROWS)
	const fit = fitView(geometry, COLS * CELL_W, ROWS * CELL_H)
	const covered = rasterize(geometry, raster, { yaw, pitch: 0.16, cellW: CELL_W, cellH: CELL_H, ...fit })
	return { raster, covered }
}

function boundingBox(lum: Float32Array) {
	let top = ROWS
	let bottom = -1
	let left = COLS
	let right = -1
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			if ((lum[r * COLS + c] ?? -1) < 0) continue
			top = Math.min(top, r)
			bottom = Math.max(bottom, r)
			left = Math.min(left, c)
			right = Math.max(right, c)
		}
	}
	return { top, bottom, left, right }
}

describe("rasterize", () => {
	// De frente, de lado (a pior vista para uma folha plana), de três quartos e de costas.
	for (const degrees of [0, 45, 90, 135, 180, 270]) {
		it(`cobre uma fração razoável da grade a ${degrees}°, sem vazar da caixa`, () => {
			const { raster, covered } = renderAt((degrees * Math.PI) / 180)
			const fraction = covered / (COLS * ROWS)
			expect(fraction).toBeGreaterThan(degrees % 180 === 90 ? 0.06 : 0.15)
			expect(fraction).toBeLessThan(0.6)
			// A folha ocupa a maior parte da altura (o enquadramento é pelo pior ângulo,
			// então de frente sobra um pouco), e nunca toca a borda.
			const box = boundingBox(raster.lum)
			expect(box.bottom - box.top).toBeGreaterThan(ROWS * 0.72)
			expect(box.top).toBeGreaterThan(0)
			expect(box.bottom).toBeLessThan(ROWS - 1)
			expect(box.left).toBeGreaterThan(0)
			expect(box.right).toBeLessThan(COLS - 1)
		})
	}

	it("dá luminância em 0..1 nas células cobertas e -1 nas vazias, com z-buffer coerente", () => {
		const { raster, covered } = renderAt(0.7)
		let counted = 0
		for (let i = 0; i < raster.lum.length; i++) {
			const l = raster.lum[i] ?? -1
			const d = raster.depth[i] ?? 0
			if (l < 0) {
				expect(d).toBe(0)
			} else {
				counted++
				expect(l).toBeGreaterThanOrEqual(0)
				expect(l).toBeLessThanOrEqual(1)
				expect(d).toBeGreaterThan(0)
			}
		}
		expect(counted).toBe(covered)
	})

	it("sombreia com variedade — não uma mancha de um tom só", () => {
		const { raster } = renderAt(-0.6)
		const used = new Set<number>()
		for (const l of raster.lum) if (l >= 0) used.add(rampIndex(l))
		expect(used.size).toBeGreaterThanOrEqual(LUMINANCE_RAMP.length - 3)
	})

	it("reaproveita os buffers: o quadro seguinte não herda células do anterior", () => {
		const raster = createRaster(COLS, ROWS)
		const fit = fitView(geometry, COLS * CELL_W, ROWS * CELL_H)
		rasterize(geometry, raster, { yaw: 0, pitch: 0.16, cellW: CELL_W, cellH: CELL_H, ...fit })
		// Escala de 1 px por unidade: a folha inteira cabe em poucas células, e o resto
		// da grade tem de vir vazio.
		const covered = rasterize(geometry, raster, { yaw: 0, pitch: 0.16, cellW: CELL_W, cellH: CELL_H, ...fit, scale: 1 })
		expect(covered).toBeGreaterThan(0)
		expect(covered).toBeLessThanOrEqual(4)
	})
})

describe("carveOcclusionEdges", () => {
	it("abre um contorno atrás das bordas de oclusão sem apagar a folha", () => {
		const { raster, covered } = renderAt(-0.6)
		carveOcclusionEdges(raster, 0.06)
		let left = 0
		for (const l of raster.lum) if (l >= 0) left++
		expect(left).toBeLessThan(covered)
		expect(left).toBeGreaterThan(covered * 0.75)
	})

	it("não mexe numa superfície única, sem sobreposição", () => {
		const raster = createRaster(3, 3)
		raster.lum.fill(0.5)
		raster.depth.fill(0.25)
		carveOcclusionEdges(raster, 0.06)
		expect([...raster.lum].every((l) => l === 0.5)).toBe(true)
	})
})

describe("rampIndex", () => {
	it("célula vazia é espaço; célula coberta nunca é", () => {
		expect(rampIndex(-1)).toBe(0)
		expect(rampIndex(Number.NaN)).toBe(0)
		expect(rampIndex(0)).toBe(1)
	})

	it("é monotônica e satura no glifo mais denso", () => {
		let previous = 0
		for (let l = 0; l <= 1; l += 0.01) {
			const i = rampIndex(l)
			expect(i).toBeGreaterThanOrEqual(previous)
			previous = i
		}
		expect(rampIndex(1)).toBe(LUMINANCE_RAMP.length - 1)
		expect(rampIndex(7)).toBe(LUMINANCE_RAMP.length - 1)
	})

	it("a rampa começa pelo vazio e não repete glifo", () => {
		expect(LUMINANCE_RAMP[0]).toBe(" ")
		expect(new Set(LUMINANCE_RAMP).size).toBe(LUMINANCE_RAMP.length)
	})
})

describe("rasterToText", () => {
	it("tem uma linha por fileira e só glifos da rampa", () => {
		const { raster } = renderAt(0.3)
		const lines = rasterToText(raster).split("\n")
		expect(lines).toHaveLength(ROWS)
		for (const line of lines) {
			expect(line.length).toBeLessThanOrEqual(COLS)
			for (const ch of line) expect(LUMINANCE_RAMP.includes(ch)).toBe(true)
		}
	})
})

describe("cellHeightFor", () => {
	it("fica entre 7 e 9 px e dá ~100 linhas numa hero de 700–900 px", () => {
		expect(cellHeightFor(200)).toBe(7)
		expect(cellHeightFor(4000)).toBe(9)
		for (const h of [700, 860, 900]) {
			const rows = h / cellHeightFor(h)
			expect(rows).toBeGreaterThanOrEqual(78)
			expect(rows).toBeLessThanOrEqual(112)
		}
	})
})
