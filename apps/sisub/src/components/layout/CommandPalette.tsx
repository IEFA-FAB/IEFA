import { Autocomplete } from "@base-ui/react/autocomplete"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { getHotkeyManager } from "@tanstack/hotkeys"
import { useNavigate } from "@tanstack/react-router"
import { CornerDownLeft, type LucideIcon, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { hasPermission, usePBAC } from "@/auth/pbac"
import { getModulesForPermissions, type ModuleId } from "@/components/layout/sidebar/NavItems"
import { DialogOverlay, DialogPortal } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { useAuth } from "@/hooks/auth/useAuth"
import {
	type CanOpen,
	indexEntries,
	type PaletteEntry,
	parseRecentScopes,
	type RecentScopes,
	type ResolvedTarget,
	resolveEntryTarget,
	type ScopeType,
	searchEntries,
} from "@/lib/command-palette"
import type { ScopeContext } from "@/types/domain/scope"

const OPEN_EVENT = "sisub:command-palette"

/** Abre a busca de qualquer lugar (botão da sidebar, hub, header mobile) sem prop drilling. */
export function openCommandPalette() {
	window.dispatchEvent(new Event(OPEN_EVENT))
}

/**
 * Rótulo do atalho. Começa "Ctrl K" (o que o servidor renderiza) e vira "⌘K" no Mac depois de
 * montar — calcular no render deixava o texto do SSR congelado no Mac, anunciando um atalho
 * que lá não existe (o `Mod` do hotkey é ⌘).
 */
export function useCommandPaletteShortcut(): string {
	const [label, setLabel] = useState("Ctrl K")
	useEffect(() => {
		// `navigator.platform` está deprecado; `userAgentData.platform` só existe em Chromium,
		// daí o userAgent como reserva (contém "Macintosh" no Safari e no Firefox).
		const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.userAgent
		if (/mac/i.test(platform)) setLabel("⌘K")
	}, [])
	return label
}

// Por usuário: num terminal compartilhado (rancho, almoxarifado) o escopo de quem saiu não
// pode virar o destino de quem entrou.
const recentScopesKey = (userId: string) => `sisub:recent-scopes:${userId}`

/** `localStorage` pode não existir ou lançar (armazenamento bloqueado, cota) — nunca derruba a tela. */
function readRecentScopes(userId: string | undefined): RecentScopes {
	if (!userId) return {}
	try {
		return parseRecentScopes(localStorage.getItem(recentScopesKey(userId)))
	} catch {
		return {}
	}
}

function rememberScope(userId: string, type: ScopeType, scope: ScopeContext) {
	try {
		localStorage.setItem(recentScopesKey(userId), JSON.stringify({ ...readRecentScopes(userId), [type]: { id: scope.id, name: scope.name } }))
	} catch {
		// sem armazenamento a busca só perde a lembrança do último escopo
	}
}

type Entry = PaletteEntry & { icon: LucideIcon; scopeNoun?: string }

/**
 * Busca de páginas: Ctrl/⌘+K abre, digita, Enter navega.
 *
 * O índice é a própria sidebar filtrada por permissão (`getModulesForPermissions`), então
 * não oferece página que o usuário não abre. Páginas de módulo com escopo usam o escopo
 * aberto agora ou o último do mesmo tipo — só se o usuário abre aquele módulo naquele
 * escopo; senão levam ao hub do módulo para escolher.
 */
export function CommandPalette({ scopeType = null, scope = null }: { scopeType?: ScopeType | null; scope?: ScopeContext | null }) {
	const navigate = useNavigate()
	const { user } = useAuth()
	const userId = user?.id
	const { permissions } = usePBAC()
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState("")
	const [recent, setRecent] = useState<RecentScopes>({})

	// Lembra o escopo aberto para a busca levar direto à mesma cozinha/unidade depois
	useEffect(() => {
		if (userId && scopeType && scope) rememberScope(userId, scopeType, scope)
	}, [userId, scopeType, scope])

	useEffect(() => {
		const show = () => {
			setRecent(readRecentScopes(userId))
			setOpen(true)
		}
		window.addEventListener(OPEN_EVENT, show)
		// Mod = ⌘ no macOS, Ctrl nos demais; dispara também com o foco num campo de texto
		const handle = getHotkeyManager().register("Mod+K", show, { ignoreInputs: false })
		return () => {
			window.removeEventListener(OPEN_EVENT, show)
			handle.unregister()
		}
	}, [userId])

	const index = useMemo(
		() =>
			indexEntries<Entry>(
				getModulesForPermissions(permissions).flatMap((m) =>
					m.items.map((it) => ({
						id: it.url,
						label: it.title,
						moduleId: m.id,
						moduleName: m.name,
						group: it.group,
						keywords: it.keywords,
						url: it.url,
						minLevel: it.minLevel,
						hubUrl: m.hubUrl,
						scopeType: m.scopeType,
						scopeNoun: m.scopeNoun,
						icon: it.icon,
					}))
				)
			),
		[permissions]
	)
	const hits = useMemo(() => searchEntries(index, query), [index, query])

	const canOpen: CanOpen = (moduleId, minLevel, s) => hasPermission(permissions, moduleId as ModuleId, minLevel, s)
	const current = scope && scopeType ? { scopeType, id: scope.id, name: scope.name } : null

	const handleOpenChange = (next: boolean) => {
		setOpen(next)
		if (!next) setQuery("")
	}

	const go = (target: ResolvedTarget) => {
		handleOpenChange(false)
		navigate({ to: target.to as Parameters<typeof navigate>[0]["to"] })
	}

	return (
		<DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
			<DialogPortal>
				<DialogOverlay />
				<DialogPrimitive.Popup className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10 shadow-lg outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-100">
					<DialogPrimitive.Title className="sr-only">Buscar página</DialogPrimitive.Title>
					<Autocomplete.Root
						inline
						open
						items={hits}
						filter={null}
						autoHighlight="always"
						value={query}
						onValueChange={(value, details) => {
							// Escolher um item navega (onClick); não deixa o rótulo dele sobrescrever a busca
							if (details.reason !== "item-press") setQuery(value)
						}}
						itemToStringValue={(entry: Entry) => entry.label}
					>
						<div className="flex items-center gap-2 border-b border-border px-3">
							<Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
							<Autocomplete.Input
								aria-label="Buscar página"
								placeholder="Buscar página — ex.: recebimentos, empenhos, inventário"
								className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
							/>
							<Kbd>Esc</Kbd>
						</div>
						<Autocomplete.List className="max-h-[min(60vh,26rem)] overflow-y-auto p-1.5 empty:hidden">
							{(entry: Entry) => {
								const target = resolveEntryTarget(entry, current, recent, canOpen)
								return (
									<Autocomplete.Item
										key={entry.id}
										value={entry}
										onClick={() => go(target)}
										className="group/item flex items-center gap-3 rounded-md px-2.5 py-2 text-sm outline-none select-none data-highlighted:bg-accent/10 data-highlighted:text-foreground"
									>
										<entry.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
										<span className="min-w-0 flex-1">
											<span className="block truncate">{entry.label}</span>
											<span className="block truncate text-caption text-muted-foreground">
												{entry.moduleName}
												{entry.group ? ` › ${entry.group}` : ""}
											</span>
										</span>
										<span className="shrink-0 text-caption text-muted-foreground">
											{target.kind === "hub" ? `escolher ${entry.scopeNoun ?? "escopo"}` : target.scopeName}
										</span>
										<CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-data-highlighted/item:opacity-100" aria-hidden="true" />
									</Autocomplete.Item>
								)
							}}
						</Autocomplete.List>
						<Autocomplete.Empty className="px-4 py-8 text-center text-sm text-muted-foreground empty:hidden">Nenhuma página encontrada.</Autocomplete.Empty>
					</Autocomplete.Root>
					<div className="flex items-center gap-3 border-t border-border px-3 py-2 text-caption text-muted-foreground">
						<span className="inline-flex items-center gap-1">
							<Kbd>↑</Kbd>
							<Kbd>↓</Kbd> navegar
						</span>
						<span className="inline-flex items-center gap-1">
							<Kbd>Enter</Kbd> abrir
						</span>
					</div>
				</DialogPrimitive.Popup>
			</DialogPortal>
		</DialogPrimitive.Root>
	)
}
