import { formatForDisplay, useHotkeys } from "@tanstack/react-hotkeys"
import { useQuery } from "@tanstack/react-query"
import { useLocation, useRouter } from "@tanstack/react-router"
import { ArrowRight, Search } from "iconoir-react"
import { createContext, type ReactNode, startTransition, useCallback, useContext, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react"
import { authQueryOptions } from "@/auth/service"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { COMMAND_PALETTE_HOTKEY, COMMAND_PALETTE_RESULT_LIMIT, type CommandPaletteItem, canAccessCommandItem, rankCommandItem } from "@/lib/command-palette"
import { userProfileQueryOptions } from "@/lib/journal/hooks"
import { cn } from "@/lib/utils"

type CommandPaletteContextValue = {
	isOpen: boolean
	openPalette: () => void
	closePalette: () => void
	registerItems: (scopeId: string, items: CommandPaletteItem[]) => void
	unregisterItems: (scopeId: string) => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

function useCommandPaletteContext() {
	const context = useContext(CommandPaletteContext)

	if (!context) {
		throw new Error("useCommandPaletteContext must be used within CommandPaletteProvider.")
	}

	return context
}

export function useCommandPalette() {
	const { isOpen, openPalette, closePalette } = useCommandPaletteContext()

	return {
		isOpen,
		openPalette,
		closePalette,
	}
}

export function useCommandPaletteItems(items: CommandPaletteItem[]) {
	const { registerItems, unregisterItems } = useCommandPaletteContext()
	const scopeId = useId()

	useEffect(() => {
		registerItems(scopeId, items)

		return () => {
			unregisterItems(scopeId)
		}
	}, [items, registerItems, scopeId, unregisterItems])
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
	const [isOpen, setIsOpen] = useState(false)
	const [query, setQuery] = useState("")
	const [highlightedIndex, setHighlightedIndex] = useState(0)
	const [contextItems, setContextItems] = useState<Record<string, CommandPaletteItem[]>>({})
	const inputRef = useRef<HTMLInputElement | null>(null)
	const deferredQuery = useDeferredValue(query)
	const router = useRouter()
	const location = useLocation()

	const { data: auth } = useQuery(authQueryOptions())
	const { data: profile } = useQuery({
		...userProfileQueryOptions(auth?.user?.id ?? ""),
		enabled: !!auth?.isAuthenticated && !!auth.user?.id,
	})

	const openPalette = useCallback(() => {
		startTransition(() => {
			setIsOpen(true)
		})
	}, [])

	const closePalette = useCallback(() => {
		startTransition(() => {
			setIsOpen(false)
			setQuery("")
			setHighlightedIndex(0)
		})
	}, [])

	const registerItems = useCallback((scopeId: string, items: CommandPaletteItem[]) => {
		setContextItems((current) => {
			const next = { ...current }
			if (items.length === 0) {
				delete next[scopeId]
				return next
			}
			next[scopeId] = items
			return next
		})
	}, [])

	const unregisterItems = useCallback((scopeId: string) => {
		setContextItems((current) => {
			if (!(scopeId in current)) {
				return current
			}

			const next = { ...current }
			delete next[scopeId]
			return next
		})
	}, [])

	useHotkeys([
		{
			hotkey: COMMAND_PALETTE_HOTKEY,
			callback: () => {
				openPalette()
			},
			options: {
				ignoreInputs: false,
				preventDefault: true,
				requireReset: true,
				stopPropagation: true,
				meta: {
					name: "Abrir navegação rápida",
					description: "Abre a busca global por páginas e resultados da tela atual",
				},
			},
		},
	])

	useEffect(() => {
		if (!isOpen) {
			return
		}

		inputRef.current?.focus()
		inputRef.current?.select()
	}, [isOpen])

	const lastLocationRef = useRef(location.href)

	useEffect(() => {
		const nextLocation = location.href

		if (!isOpen) {
			lastLocationRef.current = nextLocation
			return
		}

		if (lastLocationRef.current !== nextLocation) {
			closePalette()
		}

		lastLocationRef.current = nextLocation
	}, [closePalette, isOpen, location.href])

	const routeItems = useMemo(() => {
		const uniqueItems = new Map<string, CommandPaletteItem>()

		for (const route of Object.values(router.routesByPath)) {
			const nav = route.options.staticData?.nav
			if (!nav) {
				continue
			}

			if (route.to.includes("$")) {
				continue
			}

			const itemId = `route:${route.id}`
			uniqueItems.set(itemId, {
				id: itemId,
				kind: "route",
				title: nav.title,
				section: nav.section,
				subtitle: nav.subtitle,
				keywords: nav.keywords,
				href: route.to,
				access: nav.access,
				order: nav.order,
				perform: () => {
					void router.navigate({ to: route.to as never })
				},
			})
		}

		return Array.from(uniqueItems.values())
	}, [router])

	const registeredItems = useMemo(() => {
		return Object.values(contextItems).flat()
	}, [contextItems])

	const visibleItems = useMemo(() => {
		const isAuthenticated = auth?.isAuthenticated ?? false
		const role = profile?.role

		return [...registeredItems, ...routeItems].filter((item) => canAccessCommandItem(item.access, isAuthenticated, role))
	}, [auth?.isAuthenticated, profile?.role, registeredItems, routeItems])

	const results = useMemo(() => {
		const withScore = visibleItems
			.map((item) => ({
				item,
				score: rankCommandItem(item, deferredQuery),
			}))
			.filter(({ score }) => score >= 0)

		withScore.sort((left, right) => {
			if (deferredQuery) {
				if (right.score !== left.score) {
					return right.score - left.score
				}
			}

			const leftOrder = left.item.order ?? Number.POSITIVE_INFINITY
			const rightOrder = right.item.order ?? Number.POSITIVE_INFINITY

			if (leftOrder !== rightOrder) {
				return leftOrder - rightOrder
			}

			return left.item.title.localeCompare(right.item.title, "pt-BR")
		})

		return withScore.slice(0, COMMAND_PALETTE_RESULT_LIMIT).map(({ item }) => item)
	}, [deferredQuery, visibleItems])

	useEffect(() => {
		if (highlightedIndex < results.length) {
			return
		}

		setHighlightedIndex(Math.max(0, results.length - 1))
	}, [highlightedIndex, results.length])

	const handleSelect = (item: CommandPaletteItem | undefined) => {
		if (!item) {
			return
		}

		closePalette()
		void item.perform()
	}

	const shortcutLabel = formatForDisplay(COMMAND_PALETTE_HOTKEY)
	const selectedItem = results[highlightedIndex]
	const contextValue = useMemo(
		() => ({
			isOpen,
			openPalette,
			closePalette,
			registerItems,
			unregisterItems,
		}),
		[closePalette, isOpen, openPalette, registerItems, unregisterItems]
	)

	return (
		<CommandPaletteContext.Provider value={contextValue}>
			{children}

			<Dialog open={isOpen} onOpenChange={(open) => (open ? openPalette() : closePalette())}>
				<DialogContent className="sm:max-w-2xl p-0 overflow-hidden" showCloseButton={false}>
					<DialogTitle className="sr-only">Navegação rápida</DialogTitle>
					<DialogDescription className="sr-only">Busque páginas do portal e resultados da tela atual usando o teclado.</DialogDescription>

					<div className="border-b px-4 py-3">
						<div className="flex items-center gap-3">
							<Search className="size-4 text-muted-foreground" />
							<Input
								ref={inputRef}
								value={query}
								onChange={(event) => {
									setQuery(event.target.value)
									setHighlightedIndex(0)
								}}
								onKeyDown={(event) => {
									if (results.length === 0) {
										return
									}

									if (event.key === "ArrowDown") {
										event.preventDefault()
										setHighlightedIndex((current) => (current + 1) % results.length)
									}

									if (event.key === "ArrowUp") {
										event.preventDefault()
										setHighlightedIndex((current) => (current - 1 + results.length) % results.length)
									}

									if (event.key === "Enter") {
										event.preventDefault()
										handleSelect(selectedItem)
									}
								}}
								placeholder="Buscar página, submissão, artigo ou comando..."
								className="border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
							/>
							<Kbd>{shortcutLabel}</Kbd>
						</div>
					</div>

					<div className="max-h-[420px] overflow-y-auto p-2">
						{results.length > 0 ? (
							<div className="space-y-1">
								{results.map((item, index) => {
									const isActive = index === highlightedIndex

									return (
										<button
											type="button"
											key={item.id}
											onMouseEnter={() => setHighlightedIndex(index)}
											onClick={() => handleSelect(item)}
											className={cn(
												"flex w-full items-center justify-between rounded-md px-3 py-3 text-left transition-colors",
												isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
											)}
										>
											<div className="min-w-0">
												<div className="flex items-center gap-2">
													<span className="truncate font-medium">{item.title}</span>
													<span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
														{item.section}
													</span>
												</div>
												{item.subtitle && <div className="mt-1 truncate text-sm text-muted-foreground">{item.subtitle}</div>}
												{item.href && <div className="mt-1 truncate text-xs text-muted-foreground">{item.href}</div>}
											</div>
											<ArrowRight className="ml-4 size-4 shrink-0 text-muted-foreground" />
										</button>
									)
								})}
							</div>
						) : (
							<div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
								<div className="rounded-full bg-muted p-3">
									<Search className="size-5 text-muted-foreground" />
								</div>
								<p className="font-medium">Nenhum resultado encontrado</p>
								<p className="max-w-md text-sm text-muted-foreground">
									Tente buscar pelo nome da página, por atalhos de tarefa ou por resultados da tela atual.
								</p>
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</CommandPaletteContext.Provider>
	)
}
