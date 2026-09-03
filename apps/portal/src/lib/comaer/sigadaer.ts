/**
 * @module comaer/sigadaer
 * Saída para a área de transferência — o caminho principal desta ferramenta.
 *
 * O documento não termina em papel: ele é colado no SIGADAER. Por isso a exportação segue
 * três decisões:
 *
 * 1. **HTML mínimo e semântico** — só `<p>` e `<strong>`, sem `class`, sem `style`, sem
 *    `<div>`. Editor de sistema legado sanitiza o que não conhece, e HTML com atributo de
 *    layout costuma voltar com parágrafo colapsado ou fonte presa. O que sobra depois da
 *    sanitização tem que continuar sendo o documento.
 * 2. **A numeração é TEXTO, não `<ol>`** — os marcadores da norma (1., 1.1, a), -) não são
 *    lista HTML, e um editor com lista automática renumeraria por conta própria, quebrando
 *    a correspondência entre o que se conferiu na tela e o que foi despachado.
 * 3. **Cópia por campo, não só do documento inteiro** — o SIGADAER tem formulário com
 *    campos separados; copiar tudo obrigaria a recortar assunto e destinatário à mão.
 */

import type { AssembledBlock, AssembledDocument, Line } from "./types"

function plainLine(l: Line): string {
	// Alinhamento à direita não existe em texto puro: a localidade e a data descem para a
	// linha seguinte em vez de virar espaçamento fake, que qualquer editor destrói.
	return l.rightOnSameLine ? `${l.text}\n${l.rightOnSameLine}` : l.text
}

export function blockToPlainText(bloco: AssembledBlock): string {
	return bloco.lines.map(plainLine).join("\n")
}

export function toPlainText(doc: AssembledDocument): string {
	return doc.blocks.map(blockToPlainText).join("\n\n")
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function htmlLine(l: Line): string {
	const body = escapeHtml(l.text)
	const marcado = l.bold ? `<strong>${body}</strong>` : body
	return l.rightOnSameLine ? `<p>${marcado}<br>${escapeHtml(l.rightOnSameLine)}</p>` : `<p>${marcado}</p>`
}

export function blockToHtml(bloco: AssembledBlock): string {
	return bloco.lines.map(htmlLine).join("")
}

export function toHtml(doc: AssembledDocument): string {
	return doc.blocks.map(blockToHtml).join("")
}

export interface CopyableField {
	id: string
	label: string
	text: string
	html: string
}

/** Campos individuais, na ordem do documento, para colar um a um no formulário. */
export function copyableFields(doc: AssembledDocument): CopyableField[] {
	return doc.blocks.map((bloco) => ({
		id: bloco.id,
		label: bloco.label,
		text: blockToPlainText(bloco),
		html: blockToHtml(bloco),
	}))
}

/**
 * Escreve os dois sabores na área de transferência.
 *
 * `text/html` para o editor rico e `text/plain` para o campo que for textarea: quem decide
 * qual usar é o destino da colagem, não nós. Sem o `text/plain` junto, colar num campo
 * simples entrega a marcação crua; sem o `text/html`, o editor rico perde o negrito do
 * assunto. O `writeText` fica como reserva para navegador sem `ClipboardItem`.
 */
export async function copyDocument({ text, html }: { text: string; html: string }): Promise<void> {
	if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
		await navigator.clipboard.write([
			new ClipboardItem({
				"text/html": new Blob([html], { type: "text/html" }),
				"text/plain": new Blob([text], { type: "text/plain" }),
			}),
		])
		return
	}
	await navigator.clipboard.writeText(text)
}
