/**
 * Índice e busca da paleta de navegação (Ctrl/⌘+K).
 *
 * Puro de propósito: a paleta monta as entradas a partir de `getModulesForPermissions` (já
 * filtradas por PBAC e `minLevel`), e a busca e a resolução de escopo moram aqui, testáveis
 * sem a cadeia de env da sidebar.
 */

import { scopeUrl } from "@/lib/nav-paths"

/** Módulos cujo `$id` na URL é o mesmo recurso: a cozinha 7 da Gestão é a cozinha 7 do Estoque. */
export const SCOPE_FAMILY: Record<string, "kitchen" | "unit" | "messhall"> = {
	kitchen: "kitchen",
	"kitchen-production": "kitchen",
	storage: "kitchen",
	unit: "unit",
	"local-analytics": "unit",
	messhall: "messhall",
}

export type ScopeFamily = (typeof SCOPE_FAMILY)[string]

/** Último escopo aberto em cada família — `{ kitchen: { id: 7, name: "GAP-AF" } }`. */
export type RecentScopes = Partial<Record<ScopeFamily, { id: number; name: string }>>

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
	/** Hub de seleção de escopo do módulo, quando o módulo tem escopo */
	hubUrl?: string
}

export type ResolvedTarget =
	/** Página pronta para abrir, já no escopo */
	| { kind: "page"; to: string; scopeName?: string }
	/** Módulo com escopo e nenhum escopo conhecido: abre o hub para escolher */
	| { kind: "hub"; to: string }

/** Minúsculas e sem acento — "Previsão" casa com "previsao". */
export function normalize(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.trim()
}

/**
 * Filtra e ordena. Todo termo da busca tem que aparecer em algum lugar (rótulo, módulo,
 * grupo ou palavras-chave); o rótulo vale mais que o resto, e começo de palavra mais que meio.
 * Busca vazia devolve a lista na ordem do índice (a da sidebar).
 */
export function searchEntries<T extends PaletteEntry>(entries: readonly T[], query: string): T[] {
	const terms = normalize(query).split(/\s+/).filter(Boolean)
	if (terms.length === 0) return [...entries]

	const scored: { entry: T; score: number; index: number }[] = []
	entries.forEach((entry, index) => {
		const label = normalize(entry.label)
		const rest = normalize([entry.moduleName, entry.group ?? "", ...(entry.keywords ?? [])].join(" "))
		let score = 0
		for (const term of terms) {
			if (label.startsWith(term)) score += 8
			else if (new RegExp(`\\b${escapeRegExp(term)}`).test(label)) score += 6
			else if (label.includes(term)) score += 4
			else if (new RegExp(`\\b${escapeRegExp(term)}`).test(rest)) score += 2
			else if (rest.includes(term)) score += 1
			else return
		}
		scored.push({ entry, score, index })
	})
	return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((s) => s.entry)
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Para onde a entrada leva. Módulo sem escopo abre direto. Módulo com escopo usa, nesta
 * ordem, o escopo aberto agora (se for da mesma família) e o último escopo da família; sem
 * nenhum dos dois, abre o hub do módulo para escolher.
 */
export function resolveEntryTarget(
	entry: PaletteEntry,
	current: { moduleId: string | null; scopeId: number; scopeName: string } | null,
	recent: RecentScopes
): ResolvedTarget {
	if (!entry.hubUrl) return { kind: "page", to: entry.url }

	const family = SCOPE_FAMILY[entry.moduleId]
	const currentFamily = current?.moduleId ? SCOPE_FAMILY[current.moduleId] : undefined
	const scope = current && family && currentFamily === family ? { id: current.scopeId, name: current.scopeName } : family ? recent[family] : undefined
	if (!scope) return { kind: "hub", to: entry.hubUrl }

	return { kind: "page", to: scopeUrl(entry.url, entry.moduleId, scope.id), scopeName: scope.name }
}
