/**
 * @module comaer/inline-edit
 * Escrita de volta ao documento a partir de uma edição feita no papel.
 *
 * A folha mostra um documento MONTADO; editar ali só faz sentido se a alteração voltar à
 * origem. Este módulo é essa volta, e é puro para poder ser testado: errar o caminho aqui
 * significa o usuário digitar num parágrafo e o texto aparecer noutro.
 *
 * Trocar um número não deveria exigir uma conversa com a IA nem uma volta ao formulário —
 * é o tipo de correção que se faz olhando para o documento.
 */

import type { DocumentInput, EditTarget, Paragraph } from "./types"

function mapParagraph(paragraphs: Paragraph[], index: number, change: (p: Paragraph) => Paragraph): Paragraph[] {
	return paragraphs.map((p, i) => (i === index ? change(p) : p))
}

/** Aplica a edição. Alvo fora do documento devolve o documento intacto — nunca cria campo. */
export function applyInlineEdit(document: DocumentInput, target: EditTarget, value: string): DocumentInput {
	switch (target.field) {
		case "subject":
			return { ...document, subject: value }

		case "reference": {
			const references = [...(document.references ?? [])]
			if (target.index >= references.length) return document
			references[target.index] = value
			return { ...document, references }
		}

		case "annex": {
			const annexes = [...(document.annexes ?? [])]
			if (target.index >= annexes.length) return document
			annexes[target.index] = value
			return { ...document, annexes }
		}

		case "paragraph": {
			if (!document.paragraphs[target.paragraph]) return document
			return { ...document, paragraphs: mapParagraph(document.paragraphs, target.paragraph, (p) => ({ ...p, text: value })) }
		}

		case "item": {
			const items = document.paragraphs[target.paragraph]?.items
			if (!items?.[target.item]) return document
			return {
				...document,
				paragraphs: mapParagraph(document.paragraphs, target.paragraph, (p) => ({
					...p,
					items: (p.items ?? []).map((item, j) => (j === target.item ? { ...item, text: value } : item)),
				})),
			}
		}

		case "alinea": {
			const alineas = document.paragraphs[target.paragraph]?.items?.[target.item]?.alineas
			if (!alineas?.[target.alinea]) return document
			return {
				...document,
				paragraphs: mapParagraph(document.paragraphs, target.paragraph, (p) => ({
					...p,
					items: (p.items ?? []).map((item, j) =>
						j === target.item ? { ...item, alineas: (item.alineas ?? []).map((a, k) => (k === target.alinea ? { ...a, text: value } : a)) } : item
					),
				})),
			}
		}

		case "subalinea": {
			const subalineas = document.paragraphs[target.paragraph]?.items?.[target.item]?.alineas?.[target.alinea]?.subalineas
			if (!subalineas?.[target.subalinea]) return document
			return {
				...document,
				paragraphs: mapParagraph(document.paragraphs, target.paragraph, (p) => ({
					...p,
					items: (p.items ?? []).map((item, j) =>
						j === target.item
							? {
									...item,
									alineas: (item.alineas ?? []).map((a, k) =>
										k === target.alinea ? { ...a, subalineas: (a.subalineas ?? []).map((s, l) => (l === target.subalinea ? { text: value } : s)) } : a
									),
								}
							: item
					),
				})),
			}
		}

		default:
			return document
	}
}
