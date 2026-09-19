import { describe, expect, it } from "bun:test"
import { escapeHtml, renderHtmlTemplate, renderSubjectTemplate } from "./email-render"

describe("renderHtmlTemplate", () => {
	it("escapa o valor digitado pelo autor, não o template", () => {
		const html = renderHtmlTemplate("<p>Título: {{article_title}}</p>", {
			article_title: `<img src="https://evil.example/x?d=1" onerror='alert(1)'>`,
		})
		expect(html).toBe("<p>Título: &lt;img src=&quot;https://evil.example/x?d=1&quot; onerror=&#39;alert(1)&#39;&gt;</p>")
	})

	it("escapa `&` primeiro, sem escapar duas vezes", () => {
		expect(escapeHtml("a & b &lt;")).toBe("a &amp; b &amp;lt;")
	})

	it("aceita espaço dentro das chaves e troca variável ausente por vazio", () => {
		expect(renderHtmlTemplate("Olá {{ reviewer_name }}{{missing}}!", { reviewer_name: "Ana" })).toBe("Olá Ana!")
	})

	it("link em atributo continua válido depois do escape", () => {
		const html = renderHtmlTemplate('<a href="{{invitation_link}}">abrir</a>', { invitation_link: "https://portal/x?a=1&b=2" })
		expect(html).toBe('<a href="https://portal/x?a=1&amp;b=2">abrir</a>')
	})
})

describe("renderSubjectTemplate", () => {
	it("não escapa (assunto é texto) mas remove quebra de linha", () => {
		expect(renderSubjectTemplate("Convite: {{article_title}}", { article_title: "A & B\r\nBcc: x@y" })).toBe("Convite: A & B Bcc: x@y")
	})
})
