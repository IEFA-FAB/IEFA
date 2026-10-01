import { describe, expect, it } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MessageBody } from "./MessageBody"

/**
 * Imagem em resposta de modelo é canal de exfiltração: o navegador busca a URL sem clique,
 * e a URL pode carregar trecho da conversa na query. O corpo da mensagem não pode emitir `<img>`.
 */
const render = (content: string) => renderToStaticMarkup(createElement(MessageBody, { content, citations: [] }))

describe("MessageBody", () => {
	it("não emite <img> para imagem Markdown — mostra o texto alternativo", () => {
		const html = render("Veja ![x](https://exemplo.invalid/p?d=segredo)")
		expect(html).not.toContain("<img")
		expect(html).not.toContain("exemplo.invalid")
		expect(html).not.toContain("segredo")
		expect(html).toContain("[imagem: x]")
	})

	it("imagem por referência também não carrega", () => {
		const html = render("![][ref]\n\n[ref]: https://exemplo.invalid/y.png")
		expect(html).not.toContain("<img")
		expect(html).not.toContain("exemplo.invalid")
	})

	it("link continua link (exige clique)", () => {
		const html = render("[norma](https://www.fab.mil.br)")
		expect(html).toContain('href="https://www.fab.mil.br"')
	})
})
