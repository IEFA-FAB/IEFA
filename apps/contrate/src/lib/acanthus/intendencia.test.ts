import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseArt } from "./art"
import { buildArtCloud, createGlyphRaster, createIntendenciaScene, glyphRank, rasterizeArt } from "./intendencia"
import { fitView, type View } from "./raster"

const TEXT = readFileSync(join(import.meta.dir, "art/intendencia.txt"), "utf8")
const cloud = buildArtCloud(parseArt(TEXT))

// Grade da hero: ~110 linhas, célula 6×10.
const COLS = 150
const ROWS = 110
const CELL_W = 6
const CELL_H = 10
const fit = fitView(cloud, COLS * CELL_W, ROWS * CELL_H)
const viewAt = (yaw: number): View => ({ yaw, pitch: 0.08, cellW: CELL_W, cellH: CELL_H, ...fit })

function renderAt(yaw: number) {
	const raster = createGlyphRaster(COLS, ROWS)
	const covered = rasterizeArt(cloud, raster, viewAt(yaw))
	return { raster, covered }
}

describe("buildArtCloud", () => {
	it("só tem valores finitos e normais unitárias", () => {
		expect(cloud.positions.every(Number.isFinite)).toBe(true)
		for (let i = 0; i < cloud.count; i++) {
			const len = Math.hypot(cloud.normals[i * 3] ?? 0, cloud.normals[i * 3 + 1] ?? 0, cloud.normals[i * 3 + 2] ?? 0)
			expect(Math.abs(len - 1)).toBeLessThan(1e-4)
		}
	})

	it("usa os glifos da arte, e só eles", () => {
		const inArt = new Set(TEXT.replace(/\s/g, ""))
		expect(cloud.alphabet[0]).toBe(" ")
		expect(new Set(cloud.alphabet.slice(1))).toEqual(inArt)
		for (const g of cloud.glyphs) expect(g).toBeLessThan(cloud.alphabet.length)
	})

	it("tem corpo: de perfil a folha tem profundidade de verdade", () => {
		let loX = Infinity
		let hiX = -Infinity
		let loZ = Infinity
		let hiZ = -Infinity
		for (let i = 0; i < cloud.count; i++) {
			loX = Math.min(loX, cloud.positions[i * 3] ?? 0)
			hiX = Math.max(hiX, cloud.positions[i * 3] ?? 0)
			loZ = Math.min(loZ, cloud.positions[i * 3 + 2] ?? 0)
			hiZ = Math.max(hiZ, cloud.positions[i * 3 + 2] ?? 0)
		}
		expect(hiZ - loZ).toBeGreaterThan((hiX - loX) * 0.25)
		expect(cloud.maxY - cloud.minY).toBeGreaterThan(hiX - loX)
	})
})

describe("glyphRank", () => {
	it("o contorno vence os veios, e o espaço nunca vence", () => {
		expect(glyphRank("@")).toBeGreaterThan(glyphRank("="))
		expect(glyphRank("=")).toBeGreaterThan(glyphRank("~"))
		expect(glyphRank("~")).toBeGreaterThan(glyphRank(":"))
		expect(glyphRank(":")).toBeGreaterThan(glyphRank("."))
		expect(glyphRank(".")).toBeGreaterThan(glyphRank(" "))
		expect(glyphRank("<")).toBeGreaterThan(glyphRank("="))
	})
})

describe("rasterizeArt", () => {
	it("de frente, reamostrada, a arte continua sendo o desenho: contorno e veios sobrevivem", () => {
		const { raster, covered } = renderAt(0)
		const counts = new Map<string, number>()
		for (const g of raster.glyph) if (g) counts.set(cloud.alphabet[g] ?? "?", (counts.get(cloud.alphabet[g] ?? "?") ?? 0) + 1)
		expect(covered).toBeGreaterThan(COLS * ROWS * 0.05)
		// O '@' domina (é o traço grosso), mas os veios estão lá.
		expect(counts.get("@") ?? 0).toBeGreaterThan(covered * 0.4)
		expect((counts.get(":") ?? 0) + (counts.get(".") ?? 0) + (counts.get("~") ?? 0)).toBeGreaterThan(covered * 0.1)
		expect(counts.get("=") ?? 0).toBeGreaterThan(0)
	})

	it("o verso é o desenho espelhado, e mais apagado: a volta de 360° não se repete aos 180°", () => {
		const front = renderAt(0).raster
		const back = renderAt(Math.PI).raster
		let differ = 0
		let nonBlank = 0
		let frontShade = 0
		let backShade = 0
		let frontN = 0
		let backN = 0
		for (let i = 0; i < front.glyph.length; i++) {
			if (front.glyph[i] || back.glyph[i]) nonBlank++
			if (front.glyph[i] !== back.glyph[i]) differ++
			if (front.glyph[i]) {
				frontShade += front.shade[i] ?? 0
				frontN++
			}
			if (back.glyph[i]) {
				backShade += back.shade[i] ?? 0
				backN++
			}
		}
		expect(differ / nonBlank).toBeGreaterThan(0.3)
		expect(backShade / backN).toBeLessThan((frontShade / frontN) * 0.8)

		// Espelhado mesmo: a coluna do meio da massa de tinta troca de lado.
		const centroid = (glyph: Uint8Array) => {
			let sum = 0
			let n = 0
			for (let i = 0; i < glyph.length; i++) {
				if (!glyph[i]) continue
				sum += i % COLS
				n++
			}
			return sum / n
		}
		const mid = COLS / 2
		expect(Math.sign(centroid(front.glyph) - mid)).toBe(-Math.sign(centroid(back.glyph) - mid))
	})

	it("é opaca: de frente, os veios do verso não atravessam a folha", () => {
		// Mesma nuvem sem o verso: de frente, tem de sair a mesma imagem — o miolo
		// mudo da frente esconde tudo que está atrás.
		const keep: number[] = []
		for (let i = 0; i < cloud.count; i++) if (cloud.sides[i] !== -1) keep.push(i)
		const pick = <T extends Float32Array | Uint8Array>(src: T, stride: number, make: (n: number) => T) => {
			const out = make(keep.length * stride)
			keep.forEach((i, k) => {
				for (let s = 0; s < stride; s++) out[k * stride + s] = src[i * stride + s] ?? 0
			})
			return out
		}
		const frontOnly = {
			...cloud,
			count: keep.length,
			positions: pick(cloud.positions, 3, (n) => new Float32Array(n)),
			normals: pick(cloud.normals, 3, (n) => new Float32Array(n)),
			glyphs: pick(cloud.glyphs, 1, (n) => new Uint8Array(n)),
			ranks: pick(cloud.ranks, 1, (n) => new Uint8Array(n)),
			lights: pick(cloud.lights, 1, (n) => new Float32Array(n)),
			sides: new Int8Array(keep.length),
		}
		expect(keep.length).toBeLessThan(cloud.count * 0.7)
		const full = renderAt(0).raster
		const alone = createGlyphRaster(COLS, ROWS)
		rasterizeArt(frontOnly, alone, viewAt(0))
		let differ = 0
		let nonBlank = 0
		for (let i = 0; i < full.glyph.length; i++) {
			if (full.glyph[i] || alone.glyph[i]) nonBlank++
			if (full.glyph[i] !== alone.glyph[i]) differ++
		}
		expect(differ / nonBlank).toBeLessThan(0.03)
	})

	it("de lado não degenera numa linha", () => {
		const { covered } = renderAt(Math.PI / 2)
		const { covered: front } = renderAt(0)
		expect(covered).toBeGreaterThan(front * 0.3)
	})
})

describe("createIntendenciaScene", () => {
	it("preenche glifo e tom dentro dos limites", () => {
		const scene = createIntendenciaScene(TEXT)
		scene.resize(COLS, ROWS)
		const glyph = new Uint8Array(COLS * ROWS)
		const tone = new Uint8Array(COLS * ROWS)
		const covered = scene.render(viewAt(0.4), glyph, tone)
		expect(covered).toBeGreaterThan(0)
		for (let i = 0; i < glyph.length; i++) {
			expect(glyph[i]).toBeLessThan(scene.alphabet.length)
			if (glyph[i]) expect(tone[i]).toBeLessThan(4)
		}
	})
})
