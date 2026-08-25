import { describe, expect, test } from "bun:test"
import { isPlaceholderDataUrl, MAX_PLACEHOLDER_CHARS, placeholderActionFor } from "./image-placeholder"

/** Placeholder real, gerado por `Bun.Image#placeholder()` sobre um PNG de 1200x630. */
const REAL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAASCAYAAAA6yNxSAAAAKklEQVR4nGP88ObRf4YBBEwDafmoA0ZDYDQERkNgNARGQ2A0BEZDgFYhAADeVQQMTsq7pQAAAABJRU5ErkJggg=="

describe("isPlaceholderDataUrl", () => {
	test("aceita o que o Bun.Image gera", () => {
		expect(isPlaceholderDataUrl(REAL)).toBe(true)
	})

	test("recusa URL de arquivo, string vazia, null e não-string", () => {
		expect(isPlaceholderDataUrl("https://cdn.example/img.png")).toBe(false)
		expect(isPlaceholderDataUrl("")).toBe(false)
		expect(isPlaceholderDataUrl(null)).toBe(false)
		expect(isPlaceholderDataUrl(undefined)).toBe(false)
		expect(isPlaceholderDataUrl(42)).toBe(false)
	})

	test("recusa outro mime, mesmo sendo data URL de imagem", () => {
		// `placeholder()` sempre rasteriza em PNG; um jpeg aqui é a imagem inteira embutida.
		expect(isPlaceholderDataUrl("data:image/jpeg;base64,/9j/4AAQ")).toBe(false)
	})

	test("recusa acima do teto — imagem inteira embutida viajaria em toda linha do catálogo", () => {
		const gordo = `data:image/png;base64,${"A".repeat(MAX_PLACEHOLDER_CHARS)}`
		expect(gordo.length).toBeGreaterThan(MAX_PLACEHOLDER_CHARS)
		expect(isPlaceholderDataUrl(gordo)).toBe(false)
		// e aceita exatamente no teto, para o limite não ser off-by-one
		const noLimite = `data:image/png;base64,${"A".repeat(MAX_PLACEHOLDER_CHARS - "data:image/png;base64,".length)}`
		expect(noLimite.length).toBe(MAX_PLACEHOLDER_CHARS)
		expect(isPlaceholderDataUrl(noLimite)).toBe(true)
	})
})

describe("placeholderActionFor", () => {
	test("payload que não toca na imagem não mexe no placeholder", () => {
		// Edita só círculo/gênero: `image_path` chega como undefined.
		expect(placeholderActionFor({ nextPath: undefined, currentPath: "a/1.png", currentPlaceholder: REAL })).toBe("keep")
		expect(placeholderActionFor({ nextPath: undefined, currentPath: null, currentPlaceholder: null })).toBe("keep")
	})

	test("imagem nova gera", () => {
		expect(placeholderActionFor({ nextPath: "a/1.png", currentPath: null, currentPlaceholder: null })).toBe("build")
	})

	test("troca de imagem gera de novo — o blur antigo previa a ilustração errada", () => {
		expect(placeholderActionFor({ nextPath: "a/2.png", currentPath: "a/1.png", currentPlaceholder: REAL })).toBe("build")
	})

	test("mesmo caminho com placeholder válido não rebaixa — save não paga download", () => {
		expect(placeholderActionFor({ nextPath: "a/1.png", currentPath: "a/1.png", currentPlaceholder: REAL })).toBe("keep")
	})

	test("mesmo caminho sem placeholder gera — linha anterior à coluna, ou geração que falhou antes", () => {
		expect(placeholderActionFor({ nextPath: "a/1.png", currentPath: "a/1.png", currentPlaceholder: null })).toBe("build")
	})

	test("mesmo caminho com placeholder corrompido gera de novo", () => {
		expect(placeholderActionFor({ nextPath: "a/1.png", currentPath: "a/1.png", currentPlaceholder: "lixo" })).toBe("build")
	})

	test("remover a imagem limpa o placeholder", () => {
		expect(placeholderActionFor({ nextPath: null, currentPath: "a/1.png", currentPlaceholder: REAL })).toBe("clear")
	})

	test("remover imagem que já não tinha placeholder não escreve à toa", () => {
		expect(placeholderActionFor({ nextPath: null, currentPath: null, currentPlaceholder: null })).toBe("keep")
	})

	test("re-upload no MESMO path gera de novo — path igual não significa imagem igual", () => {
		// O caso mais comum do admin: trocar a ilustração por outra do mesmo formato. O path é
		// derivado da variante e o storage grava com `upsert: true`, então ele não muda. Sem o
		// sinal `uploaded` a decisão por caminho manteria o blur da ilustração ANTERIOR.
		expect(placeholderActionFor({ nextPath: "a/1.png", currentPath: "a/1.png", currentPlaceholder: REAL, uploaded: true })).toBe("build")
	})

	test("`uploaded` não ressuscita placeholder de imagem removida", () => {
		// Remoção continua vencendo: não há bytes em `null` para gerar nada.
		expect(placeholderActionFor({ nextPath: null, currentPath: "a/1.png", currentPlaceholder: REAL, uploaded: true })).toBe("clear")
	})

	test("`uploaded` não força escrita quando o payload não fala de imagem", () => {
		expect(placeholderActionFor({ nextPath: undefined, currentPath: "a/1.png", currentPlaceholder: REAL, uploaded: true })).toBe("keep")
	})
})
