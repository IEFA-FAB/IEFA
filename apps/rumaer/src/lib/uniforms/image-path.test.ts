/**
 * Caminho de imagem derivado dos ids — ver `image-path.ts`.
 *
 * Rode com: `bun test src/lib/uniforms/image-path.test.ts` (dentro de apps/rumaer).
 */

import { describe, expect, test } from "bun:test"
import { imageExtensionFor, isOwnImagePath, lookImagePath, parseImagePath, variantImagePath } from "./image-path"

const U = "11111111-1111-4111-8111-111111111111"
const V = "22222222-2222-4222-8222-222222222222"
const P = "33333333-3333-4333-8333-333333333333"

describe("imageExtensionFor", () => {
	test("png, jpeg e webp viram png, jpg e webp", () => {
		expect(imageExtensionFor("image/png")).toBe("png")
		expect(imageExtensionFor("image/jpeg")).toBe("jpg")
		expect(imageExtensionFor("image/webp")).toBe("webp")
	})

	test("svg, html, gif e vazio são recusados", () => {
		for (const mime of ["image/svg+xml", "text/html", "image/gif", ""]) expect(imageExtensionFor(mime)).toBeNull()
	})
})

describe("parseImagePath", () => {
	test("aceita o caminho da imagem base e o do look", () => {
		expect(parseImagePath(variantImagePath(U, V, "png"))).toEqual({ uniformId: U, variantId: V, pieceId: null, ext: "png" })
		expect(parseImagePath(lookImagePath(U, V, P, "webp"))).toEqual({ uniformId: U, variantId: V, pieceId: P, ext: "webp" })
		expect(parseImagePath(`${U}/${V}.jpeg`)?.ext).toBe("jpeg")
	})

	test("recusa extensão ativa, travessia, prefixo solto e texto livre", () => {
		for (const path of [
			`${U}/${V}.svg`,
			`${U}/${V}.html`,
			`${U}/${V}.png.html`,
			`../${U}/${V}.png`,
			`${U}/../${V}.png`,
			`x/${U}/${V}.png`,
			`${U}/${V}`,
			`${U}/nao-uuid.png`,
			`${U}/${V}__.png`,
			`${U}/${V}.PNG`,
			"qualquer/coisa.png",
		]) {
			expect(parseImagePath(path)).toBeNull()
		}
	})
})

describe("isOwnImagePath", () => {
	test("imagem base: só o caminho da própria variante", () => {
		expect(isOwnImagePath(variantImagePath(U, V, "png"), { uniformId: U, variantId: V })).toBe(true)
		expect(isOwnImagePath(variantImagePath(U, P, "png"), { uniformId: U, variantId: V })).toBe(false)
		expect(isOwnImagePath(variantImagePath(P, V, "png"), { uniformId: U, variantId: V })).toBe(false)
		// Caminho de look não serve de imagem base.
		expect(isOwnImagePath(lookImagePath(U, V, P, "png"), { uniformId: U, variantId: V })).toBe(false)
	})

	test("look: só o caminho da própria variante + peça", () => {
		expect(isOwnImagePath(lookImagePath(U, V, P, "jpg"), { uniformId: U, variantId: V, pieceId: P })).toBe(true)
		expect(isOwnImagePath(lookImagePath(U, V, U, "jpg"), { uniformId: U, variantId: V, pieceId: P })).toBe(false)
		expect(isOwnImagePath(variantImagePath(U, V, "jpg"), { uniformId: U, variantId: V, pieceId: P })).toBe(false)
	})
})
