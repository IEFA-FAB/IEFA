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

import type { BlocoMontado, DocumentoMontado, Linha } from "./tipos"

function linhaPlano(l: Linha): string {
	// Alinhamento à direita não existe em texto puro: a localidade e a data descem para a
	// linha seguinte em vez de virar espaçamento fake, que qualquer editor destrói.
	return l.mesmaLinhaDireita ? `${l.texto}\n${l.mesmaLinhaDireita}` : l.texto
}

export function blocoParaTextoPlano(bloco: BlocoMontado): string {
	return bloco.linhas.map(linhaPlano).join("\n")
}

export function paraTextoPlano(doc: DocumentoMontado): string {
	return doc.blocos.map(blocoParaTextoPlano).join("\n\n")
}

function escaparHtml(texto: string): string {
	return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function linhaHtml(l: Linha): string {
	const corpo = escaparHtml(l.texto)
	const marcado = l.negrito ? `<strong>${corpo}</strong>` : corpo
	return l.mesmaLinhaDireita ? `<p>${marcado}<br>${escaparHtml(l.mesmaLinhaDireita)}</p>` : `<p>${marcado}</p>`
}

export function blocoParaHtml(bloco: BlocoMontado): string {
	return bloco.linhas.map(linhaHtml).join("")
}

export function paraHtml(doc: DocumentoMontado): string {
	return doc.blocos.map(blocoParaHtml).join("")
}

export interface CampoCopiavel {
	id: string
	rotulo: string
	texto: string
	html: string
}

/** Campos individuais, na ordem do documento, para colar um a um no formulário. */
export function camposParaCopia(doc: DocumentoMontado): CampoCopiavel[] {
	return doc.blocos.map((bloco) => ({
		id: bloco.id,
		rotulo: bloco.rotulo,
		texto: blocoParaTextoPlano(bloco),
		html: blocoParaHtml(bloco),
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
export async function copiarDocumento({ texto, html }: { texto: string; html: string }): Promise<void> {
	if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
		await navigator.clipboard.write([
			new ClipboardItem({
				"text/html": new Blob([html], { type: "text/html" }),
				"text/plain": new Blob([texto], { type: "text/plain" }),
			}),
		])
		return
	}
	await navigator.clipboard.writeText(texto)
}
