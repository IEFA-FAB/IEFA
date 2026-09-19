/**
 * @module email-render
 * Substituição de `{{chave}}` nos templates de `journal.email_templates`.
 *
 * O TEMPLATE é confiável (vem do seed/editor); os VALORES não: título, resumo e nome do
 * autor são digitados por quem submete e caem no e-mail de convite de um revisor. O
 * corpo sai como `html:` no Resend — sem escapar, um título com `<a href>` ou `<img>`
 * virava HTML ativo no e-mail de outra pessoa. Por isso o valor é escapado na
 * substituição, e nunca o template inteiro.
 *
 * Módulo puro (sem env nem client) para ser testável sem credencial.
 */

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
}

export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
}

/** Corpo do e-mail: cada valor substituído é escapado para HTML. */
export function renderHtmlTemplate(template: string, vars: Record<string, string>): string {
	return template.replace(PLACEHOLDER, (_match, key: string) => escapeHtml(vars[key] ?? ""))
}

/**
 * Assunto: texto puro (escapar mostraria `&amp;` na caixa de entrada), mas sem quebra de
 * linha — um título com `\r\n` não pode virar linha nova no cabeçalho.
 */
export function renderSubjectTemplate(template: string, vars: Record<string, string>): string {
	return template.replace(PLACEHOLDER, (_match, key: string) => (vars[key] ?? "").replace(/[\r\n]+/g, " "))
}
