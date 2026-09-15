import { ChevronDown, ChevronUp, ListChecks, Replace, Search, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { RecipeSelector } from "@/components/features/local/planning/RecipeSelector"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import { findMenuItems, type MenuDraftItem, type MenuMatch } from "@/lib/menu-fill"

/**
 * Localizar dentro do cardápio — barra fixa, não diálogo: o resultado precisa levar o usuário
 * ao item, e um modal esconderia justamente o cardápio atrás dele.
 *
 * Busca parcial e sem acento, como a das listagens ("arr" traz todos os arrozes). Enter anda
 * para a próxima aparição, Shift+Enter para a anterior, Esc fecha. Substituir troca a
 * preparação em todas as aparições de uma vez.
 */
export function MenuFindBar<T extends MenuDraftItem>({
	items,
	nameOf,
	mealTypeOrder,
	dayLabel,
	mealLabel,
	kitchenId,
	onGoTo,
	onReplaceAll,
	onSelectMatches,
}: {
	items: readonly T[]
	nameOf: (recipeId: string) => string | undefined
	mealTypeOrder: readonly string[]
	/** `null` em evento/exceção, que não têm dias. */
	dayLabel: ((day: number) => string) | null
	mealLabel: (mealTypeId: string) => string
	kitchenId: number | null
	/** Leva o editor até a aparição (troca a aba do dia e destaca o item). */
	onGoTo: (match: MenuMatch<T>) => void
	onReplaceAll: (keys: ReadonlySet<string>, recipeId: string) => void
	/** Manda as aparições para a seleção múltipla, para uma ação em massa. */
	onSelectMatches: (keys: ReadonlySet<string>) => void
}) {
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState("")
	const [index, setIndex] = useState(0)
	const [showList, setShowList] = useState(false)
	const [replaceOpen, setReplaceOpen] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	const matches = useMemo(() => findMenuItems(items, nameOf, query, { mealTypeOrder }), [items, nameOf, query, mealTypeOrder])

	// Ctrl/Cmd+F abre a barra e foca o campo — o localizar do navegador não enxerga o que
	// está nas outras abas de dia, então assumir o atalho aqui evita uma busca que mente.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
				event.preventDefault()
				setOpen(true)
				requestAnimationFrame(() => inputRef.current?.focus())
			}
		}
		window.addEventListener("keydown", onKeyDown)
		return () => window.removeEventListener("keydown", onKeyDown)
	}, [])

	// Busca nova recomeça da primeira aparição.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reiniciar é efeito da busca, não da lista
	useEffect(() => {
		setIndex(0)
	}, [query])

	const goTo = (nextIndex: number) => {
		if (matches.length === 0) return
		const wrapped = (nextIndex + matches.length) % matches.length
		setIndex(wrapped)
		const match = matches[wrapped]
		if (match) onGoTo(match)
	}

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") {
			setOpen(false)
			return
		}
		if (event.key !== "Enter") return
		event.preventDefault()
		goTo(event.shiftKey ? index - 1 : index + 1)
	}

	if (!open) {
		return (
			<Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
				<Search className="size-4 sm:mr-2" />
				<span className="hidden sm:inline">Localizar</span>
			</Button>
		)
	}

	const current = matches[index]

	return (
		<>
			<div className="flex w-full flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
				<div className="relative min-w-48 flex-1">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						ref={inputRef}
						// Só existe depois de um pedido explícito de busca (botão ou Ctrl+F).
						autoFocus
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Localizar preparação no cardápio (ex.: arr)"
						className="pl-9"
						aria-label="Localizar preparação no cardápio"
					/>
				</div>

				<Badge variant={matches.length > 0 ? "secondary" : "outline"} className="tabular-nums">
					{matches.length === 0 ? (query.trim() ? "nenhuma" : "—") : `${index + 1} de ${matches.length}`}
				</Badge>

				<Tooltip>
					<TooltipTrigger
						render={
							<Button type="button" variant="ghost" size="icon-sm" disabled={matches.length === 0} onClick={() => goTo(index - 1)} aria-label="Anterior" />
						}
					>
						<ChevronUp className="size-4" />
					</TooltipTrigger>
					<TooltipContent>Anterior (Shift+Enter)</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button type="button" variant="ghost" size="icon-sm" disabled={matches.length === 0} onClick={() => goTo(index + 1)} aria-label="Próxima" />
						}
					>
						<ChevronDown className="size-4" />
					</TooltipTrigger>
					<TooltipContent>Próxima (Enter)</TooltipContent>
				</Tooltip>

				<Button type="button" variant="ghost" size="sm" disabled={matches.length === 0} onClick={() => setShowList((v) => !v)}>
					{showList ? "Ocultar lista" : "Ver todas"}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="gap-1.5"
					disabled={matches.length === 0}
					onClick={() => onSelectMatches(new Set(matches.map((m) => m.key)))}
				>
					<ListChecks className="size-4" />
					Selecionar
				</Button>
				<Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={matches.length === 0} onClick={() => setReplaceOpen(true)}>
					<Replace className="size-4" />
					Substituir
				</Button>

				<Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Fechar busca">
					<X className="size-4" />
				</Button>

				{showList && matches.length > 0 && (
					<ItemGroup className="max-h-64 w-full overflow-y-auto">
						{matches.map((match, matchIndex) => (
							<Item
								key={match.key}
								size="xs"
								variant="default"
								className={cn("cursor-pointer", matchIndex === index && "bg-muted")}
								onClick={() => goTo(matchIndex)}
							>
								<ItemContent>
									<ItemTitle>{match.name}</ItemTitle>
									<ItemDescription>
										{dayLabel ? `${dayLabel(match.item.day_of_week)} · ` : ""}
										{mealLabel(match.item.meal_type_id)}
									</ItemDescription>
								</ItemContent>
							</Item>
						))}
					</ItemGroup>
				)}
			</div>

			<RecipeSelector
				open={replaceOpen}
				onClose={() => setReplaceOpen(false)}
				kitchenId={kitchenId}
				selectedRecipeIds={current ? [current.item.recipe_id] : []}
				multiSelect={false}
				onSelect={(recipeIds) => {
					const [recipeId] = recipeIds
					if (recipeId) onReplaceAll(new Set(matches.map((m) => m.key)), recipeId)
					setReplaceOpen(false)
				}}
			/>
		</>
	)
}
