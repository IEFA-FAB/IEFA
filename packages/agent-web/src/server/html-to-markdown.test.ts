import { describe, expect, test } from "bun:test"
import { htmlToMarkdown } from "./html-to-markdown"

function page(body: string, head = "<title>Título</title><meta name='description' content='Resumo.'>") {
	return `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`
}

describe("htmlToMarkdown", () => {
	test("extrai só a região de conteúdo", () => {
		const html = page(`
			<header><nav><a href="/x">Menu</a></nav></header>
			<main id="conteudo"><h1>Assunto</h1><p>Corpo do texto.</p></main>
			<footer>Rodapé institucional</footer>
		`)
		const result = htmlToMarkdown(html, "https://teste.iefa.com.br/pagina")

		expect(result?.markdown).toContain("Corpo do texto.")
		expect(result?.markdown).not.toContain("Rodapé institucional")
		expect(result?.markdown).not.toContain("Menu")
	})

	test("cabeçalho traz título, descrição e URL de origem", () => {
		const result = htmlToMarkdown(page("<main>Oi</main>"), "https://teste.iefa.com.br/p")
		expect(result?.markdown).toStartWith("# Título")
		expect(result?.markdown).toContain("> Resumo.")
		expect(result?.markdown).toContain("Fonte: <https://teste.iefa.com.br/p>")
		expect(result?.title).toBe("Título")
	})

	// O estado serializado do router vive em <script> e é o maior ruído da página.
	test("remove script, style e conteúdo aria-hidden", () => {
		const html = page(`<main id="conteudo">
			<p>Visível</p>
			<script>window.__ROUTER__ = {"muito":"ruido"}</script>
			<style>.a{color:red}</style>
			<span aria-hidden="true">decorativo</span>
		</main>`)
		const markdown = htmlToMarkdown(html, "https://teste.iefa.com.br/")?.markdown ?? ""

		expect(markdown).toContain("Visível")
		expect(markdown).not.toContain("__ROUTER__")
		expect(markdown).not.toContain("color:red")
		expect(markdown).not.toContain("decorativo")
	})

	test("respeita a ordem dos seletores", () => {
		const html = page('<main id="conteudo">Certo</main><main>Errado</main>')
		expect(htmlToMarkdown(html, "https://x.test/")?.markdown).toContain("Certo")
	})

	test("cai para o próximo seletor quando o primeiro não existe", () => {
		const html = page("<main>Conteúdo sem id</main>")
		expect(htmlToMarkdown(html, "https://x.test/")?.markdown).toContain("Conteúdo sem id")
	})

	// Sem isso o chamador serviria markdown vazio em vez do HTML útil.
	test("retorna null quando a região de conteúdo está vazia", () => {
		expect(htmlToMarkdown(page('<main id="conteudo"><script>x=1</script></main>'), "https://x.test/")).toBeNull()
	})

	test("preserva links e listas", () => {
		const html = page('<main><ul><li><a href="/destino">Rótulo</a></li></ul></main>')
		const markdown = htmlToMarkdown(html, "https://x.test/")?.markdown ?? ""
		expect(markdown).toContain("[Rótulo](/destino)")
	})

	test("funciona sem title nem description", () => {
		const result = htmlToMarkdown(page("<main>Texto</main>", ""), "https://x.test/")
		expect(result?.markdown).toContain("Texto")
		expect(result?.title).toBeUndefined()
	})
})
