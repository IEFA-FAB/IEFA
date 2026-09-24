/**
 * Índice e busca da paleta de navegação (Ctrl/⌘+K).
 *
 * Puro de propósito: a paleta monta as entradas a partir de `getModulesForPermissions` (já
 * filtradas por PBAC e `minLevel`), e a busca e a resolução de escopo moram aqui, testáveis
 * sem a cadeia de env da sidebar.
 */

import { scopeUrl } from "@/lib/nav-paths"
import { normalize, toSearchTerms } from "@/lib/searchable-select-filter"

/**
 * Tipo de escopo PBAC do módulo — o mesmo `{ type }` do `requirePermission` da rota. Módulos
 * com o mesmo tipo compartilham o id: a cozinha 7 da Gestão é a cozinha 7 do Estoque.
 */
export type ScopeType = "kitchen" | "unit" | "mess_hall"

/** Último escopo aberto de cada tipo — `{ kitchen: { id: 7, name: "GAP-AF" } }`. */
export type RecentScopes = Partial<Record<ScopeType, { id: number; name: string }>>

export type PaletteEntry = {
	/** URL base da sidebar — única por página */
	id: string
	label: string
	moduleId: string
	moduleName: string
	group?: string
	keywords?: readonly string[]
	/** URL base (sem escopo) */
	url: string
	/** Nível PBAC exigido pela página (default 1) — conferido também no escopo emprestado */
	minLevel?: number
	/** Hub de seleção de escopo do módulo, quando o módulo tem escopo */
	hubUrl?: string
	scopeType?: ScopeType
}

export type ResolvedTarget =
	/** Página pronta para abrir, já no escopo */
	| { kind: "page"; to: string; scopeName?: string }
	/** Módulo com escopo e nenhum escopo utilizável: abre o hub para escolher */
	| { kind: "hub"; to: string }

/** O usuário abre `moduleId` no nível `minLevel` dentro deste escopo? (`hasPermission` com escopo) */
export type CanOpen = (moduleId: string, minLevel: number, scope: { type: ScopeType; id: number }) => boolean

/** Entrada com os textos já normalizados — calculado uma vez por índice, não a cada tecla. */
export type IndexedEntry<T extends PaletteEntry> = { entry: T; label: string; rest: string }

export function indexEntries<T extends PaletteEntry>(entries: readonly T[]): IndexedEntry<T>[] {
	return entries.map((entry) => ({
		entry,
		label: normalize(entry.label),
		rest: normalize([entry.moduleName, entry.group ?? "", ...(entry.keywords ?? [])].join(" ")),
	}))
}

/**
 * Filtra e ordena. Todo termo da busca tem que aparecer em algum lugar (rótulo, módulo,
 * grupo ou palavras-chave); o rótulo vale mais que o resto, e começo de palavra mais que meio.
 * Busca vazia devolve a lista na ordem do índice (a da sidebar).
 */
export function searchEntries<T extends PaletteEntry>(index: readonly IndexedEntry<T>[], query: string): T[] {
	const terms = toSearchTerms(query).map((term) => ({ term, wordStart: new RegExp(`\\b${escapeRegExp(term)}`) }))
	if (terms.length === 0) return index.map((i) => i.entry)

	const scored: { entry: T; score: number; order: number }[] = []
	index.forEach(({ entry, label, rest }, order) => {
		let score = 0
		for (const { term, wordStart } of terms) {
			if (label.startsWith(term)) score += 8
			else if (wordStart.test(label)) score += 6
			else if (label.includes(term)) score += 4
			else if (wordStart.test(rest)) score += 2
			else if (rest.includes(term)) score += 1
			else return
		}
		scored.push({ entry, score, order })
	})
	return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((s) => s.entry)
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Para onde a entrada leva. Módulo sem escopo abre direto. Módulo com escopo tenta, nesta
 * ordem, o escopo aberto agora (se for do mesmo tipo) e o último do tipo — cada um só se o
 * usuário abre ESTE módulo, neste nível, NAQUELE escopo (ter a cozinha 7 na Gestão não dá o
 * Estoque da 7). Sem candidato válido, abre o hub do módulo para escolher.
 */
export function resolveEntryTarget(
	entry: PaletteEntry,
	current: { scopeType: ScopeType; id: number; name: string } | null,
	recent: RecentScopes,
	canOpen: CanOpen
): ResolvedTarget {
	if (!entry.hubUrl || !entry.scopeType) return { kind: "page", to: entry.url }

	const type = entry.scopeType
	const candidates = [current?.scopeType === type ? current : undefined, recent[type]]
	for (const scope of candidates) {
		if (scope && canOpen(entry.moduleId, entry.minLevel ?? 1, { type, id: scope.id })) {
			return { kind: "page", to: scopeUrl(entry.url, entry.moduleId, scope.id), scopeName: scope.name }
		}
	}
	return { kind: "hub", to: entry.hubUrl }
}
