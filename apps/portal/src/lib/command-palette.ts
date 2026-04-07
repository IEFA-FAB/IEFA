import type { UserRole } from "@/lib/journal/types"

export const COMMAND_PALETTE_HOTKEY = "Mod+K" as const
export const COMMAND_PALETTE_RESULT_LIMIT = 12

export type RouteAccessLevel = "public" | "anonymous" | "authenticated" | "editor"

export interface RouteNavMeta {
	title: string
	section: string
	subtitle?: string
	keywords?: string[]
	access?: RouteAccessLevel
	order?: number
}

export interface CommandPaletteItem {
	id: string
	kind: "route" | "context"
	title: string
	section: string
	subtitle?: string
	keywords?: string[]
	href?: string
	access?: RouteAccessLevel
	order?: number
	perform: () => void | Promise<void>
}

export function canAccessCommandItem(access: RouteAccessLevel | undefined, isAuthenticated: boolean, role: UserRole | undefined) {
	switch (access) {
		case "anonymous":
			return !isAuthenticated
		case "authenticated":
			return isAuthenticated
		case "editor":
			return isAuthenticated && role === "editor"
		default:
			return true
	}
}

export function normalizeCommandText(value: string | undefined) {
	return (value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim()
}

export function rankCommandItem(item: CommandPaletteItem, query: string) {
	const normalizedQuery = normalizeCommandText(query)
	if (!normalizedQuery) {
		return 0
	}

	const terms = normalizedQuery.split(/\s+/).filter(Boolean)
	const title = normalizeCommandText(item.title)
	const subtitle = normalizeCommandText(item.subtitle)
	const section = normalizeCommandText(item.section)
	const href = normalizeCommandText(item.href)
	const keywords = item.keywords?.map((keyword) => normalizeCommandText(keyword)).filter(Boolean) ?? []

	let score = 0

	for (const term of terms) {
		let matched = false

		if (title === term) {
			score += 140
			matched = true
		} else if (title.startsWith(term)) {
			score += 100
			matched = true
		} else if (title.includes(term)) {
			score += 80
			matched = true
		}

		if (!matched && keywords.some((keyword) => keyword.startsWith(term))) {
			score += 60
			matched = true
		}

		if (!matched && keywords.some((keyword) => keyword.includes(term))) {
			score += 45
			matched = true
		}

		if (!matched && subtitle.includes(term)) {
			score += 35
			matched = true
		}

		if (!matched && section.includes(term)) {
			score += 25
			matched = true
		}

		if (!matched && href.includes(term)) {
			score += 20
			matched = true
		}

		if (!matched) {
			return -1
		}
	}

	return score
}
