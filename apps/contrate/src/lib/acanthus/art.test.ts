import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { distanceToEdge, fillSilhouette, parseArt } from "./art"

// O teste lê o arquivo pelo fs; `?raw` é coisa do Vite.
const TEXT = readFileSync(join(import.meta.dir, "art/intendencia.txt"), "utf8")

const at = (mask: Uint8Array, cols: number, r: number, c: number) => mask[r * cols + c]

describe("parseArt", () => {
	it("corta as linhas em branco das pontas e mede pela linha mais longa", () => {
		const art = parseArt("\n\n  ab\n c\r\n\n")
		expect(art.rows).toBe(2)
		expect(art.cols).toBe(4)
		expect(String.fromCharCode(...art.chars)).toBe("  ab c  ")
	})

	it("lê a arte do mantenedor sem perder glifo", () => {
		const art = parseArt(TEXT)
		expect(art.cols).toBeGreaterThan(200)
		expect(art.rows).toBeGreaterThan(200)
		const visible = TEXT.replace(/\s/g, "").length
		let counted = 0
		for (const code of art.chars) if (code !== 32) counted++
		expect(counted).toBe(visible)
	})
})

describe("fillSilhouette", () => {
	it("preenche um contorno fechado mesmo com uma falha, sem inchar a tinta solta fora dele", () => {
		const art = parseArt(["@@@@@@@@@@@@", "@          @", "@    .     @", "@          @", "@@@@@  @@@@@", "", "", "", "", "", "           ."].join("\n"))
		const inside = fillSilhouette(art, 2)
		// Miolo (inclusive o veio) é folha, apesar da falha de 2 células embaixo.
		expect(at(inside, art.cols, 2, 3)).toBe(1)
		expect(at(inside, art.cols, 2, 5)).toBe(1)
		// Contorno é folha.
		expect(at(inside, art.cols, 0, 0)).toBe(1)
		// O ponto solto lá embaixo continua no desenho, mas o vazio em volta dele não é folha.
		expect(at(inside, art.cols, 10, 11)).toBe(1)
		expect(at(inside, art.cols, 10, 10)).toBe(0)
		expect(at(inside, art.cols, 9, 11)).toBe(0)
	})

	it("na arte do mantenedor: fundo nas bordas da grade, folha no meio, e toda a tinta do contorno é folha", () => {
		const art = parseArt(TEXT)
		const inside = fillSilhouette(art)
		const { cols, rows, chars } = art
		expect(at(inside, cols, 0, 0)).toBe(0)
		expect(at(inside, cols, rows - 1, cols - 1)).toBe(0)
		let area = 0
		let outlineOutside = 0
		for (let i = 0; i < inside.length; i++) {
			if (inside[i]) area++
			if (chars[i] === 64 && !inside[i]) outlineOutside++
		}
		// A folha ocupa uma fração plausível da grade — nem vazou para o fundo, nem ficou só o traço.
		expect(area / inside.length).toBeGreaterThan(0.25)
		expect(area / inside.length).toBeLessThan(0.7)
		expect(outlineOutside).toBe(0)
	})
})

describe("distanceToEdge", () => {
	it("é zero fora, cresce para o miolo e é simétrica num quadrado", () => {
		const n = 9
		const inside = new Uint8Array(n * n)
		for (let r = 2; r < 7; r++) for (let c = 2; c < 7; c++) inside[r * n + c] = 1
		const d = distanceToEdge(inside, n, n)
		expect(d[0]).toBe(0)
		expect(d[2 * n + 2]).toBeCloseTo(1, 5)
		expect(d[4 * n + 4]).toBeCloseTo(3, 5)
		expect(d[3 * n + 4]).toBe(d[5 * n + 4] as number)
		expect(d[4 * n + 3]).toBe(d[4 * n + 5] as number)
	})
})
