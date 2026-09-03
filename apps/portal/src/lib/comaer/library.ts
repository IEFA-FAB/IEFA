/**
 * @module comaer/library
 * Busca e filtro da lista de documentos.
 *
 * Puro e fora do componente para poder ser testado: buscar por texto em português é o tipo
 * de coisa que parece trivial e falha em silêncio — quem digita "oficio" não encontra
 * "Ofício", e desiste achando que o documento sumiu.
 */

import { findKind } from "./catalog"

export interface LibraryItem {
	id: string
	title: string | null
	kind: string
	updated_at: string
}

export interface LibraryFilter {
	search: string
	/** `null` = todas as espécies. */
	kind: string | null
}

/** Sem acento, sem caixa: a busca compara o que a pessoa digita, não o que ela deveria digitar. */
function normalize(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim()
}

/**
 * Filtra por espécie e por texto. O texto casa no título E no rótulo da espécie — quem
 * procura "requerimento" espera achar os requerimentos, mesmo que a palavra não esteja no
 * assunto de nenhum deles.
 */
export function filterDocuments<T extends LibraryItem>(items: readonly T[], filter: LibraryFilter): T[] {
	const terms = normalize(filter.search).split(/\s+/).filter(Boolean)

	return items.filter((item) => {
		if (filter.kind && item.kind !== filter.kind) return false
		if (terms.length === 0) return true

		const haystack = normalize(`${item.title ?? ""} ${findKind(item.kind)?.label ?? item.kind}`)
		// Todos os termos precisam aparecer: "oficio comgep" é um filtro, não uma frase.
		return terms.every((term) => haystack.includes(term))
	})
}

/** Espécies presentes na lista, com contagem — o filtro só oferece o que existe. */
export function kindsPresent<T extends LibraryItem>(items: readonly T[]): { id: string; label: string; count: number }[] {
	const counts = new Map<string, number>()
	for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1)
	return [...counts.entries()].map(([id, count]) => ({ id, label: findKind(id)?.label ?? id, count })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
}
