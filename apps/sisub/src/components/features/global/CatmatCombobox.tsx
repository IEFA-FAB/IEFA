import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { buttonVariants } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/cn"
import { catmatQueryOptions } from "@/services/IngredientsService"

type CatmatSearchItem = {
	codigo_item: number
	descricao_item: string
	item_sustentavel: boolean | null
}

interface CatmatComboboxProps {
	value: number | null
	descricao: string | null
	onChange: (codigo: number | null, descricao: string | null) => void
}

/**
 * Combobox de busca CATMAT (catálogo Compras.gov.br).
 * Debounce 400ms, mantém resultados anteriores enquanto carrega, estado de loading.
 */
export function CatmatCombobox({ value, descricao, onChange }: CatmatComboboxProps) {
	const [open, setOpen] = useState(false)
	const [inputValue, setInputValue] = useState("")
	const [debouncedSearch, setDebouncedSearch] = useState("")

	// Debounce: 400ms — avoids hammering the server on every keystroke
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(inputValue.trim()), 400)
		return () => clearTimeout(timer)
	}, [inputValue])

	const minCharsReached = debouncedSearch.length >= 3
	const inputReachesMin = inputValue.trim().length >= 3
	const isTyping = inputReachesMin && inputValue.trim() !== debouncedSearch

	const { data: results = [], isFetching } = useQuery({
		...catmatQueryOptions(debouncedSearch),
		// Keep previous results visible while new search loads — avoids list flash
		placeholderData: keepPreviousData,
	})

	const showLoading = isTyping || (minCharsReached && isFetching)

	function handleOpenChange(next: boolean) {
		setOpen(next)
		if (!next) setInputValue("")
	}

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger
				type="button"
				role="combobox"
				aria-expanded={open}
				aria-controls="catmat-combobox-popup"
				className={cn(buttonVariants({ variant: "outline" }), "h-auto min-h-9 w-full justify-between font-normal")}
			>
				{value ? (
					<span className="flex min-w-0 items-center gap-2">
						<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">#{value}</span>
						<span className="truncate text-sm">{descricao ?? "..."}</span>
					</span>
				) : (
					<span className="text-muted-foreground">Vincular código CATMAT...</span>
				)}
				<ChevronsUpDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
			</PopoverTrigger>

			<PopoverContent
				id="catmat-combobox-popup"
				className="p-0"
				style={{ width: "var(--radix-popover-trigger-width)", minWidth: "360px", maxWidth: "700px" }}
				align="start"
			>
				<Command shouldFilter={false}>
					<CommandInput placeholder="Código (ex: 327430) ou parte da descrição..." value={inputValue} onValueChange={setInputValue} />

					<CommandList className="max-h-[300px]">
						{/* Idle — waiting for 3+ chars */}
						{inputValue.trim().length < 3 && <div className="py-6 text-center text-sm text-muted-foreground">Pesquise o código ou parte da descrição.</div>}

						{/* Loading / debouncing */}
						{inputValue.trim().length >= 3 && showLoading && (
							<div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
								<Loader2 className="size-4 animate-spin" />
								Buscando...
							</div>
						)}

						{/* Results */}
						{inputValue.trim().length >= 3 &&
							!showLoading &&
							(results.length === 0 ? (
								<CommandEmpty>Nenhum resultado para "{debouncedSearch}".</CommandEmpty>
							) : (
								<CommandGroup>
									{value && (
										<CommandItem
											value="__CLEAR__"
											onSelect={() => {
												onChange(null, null)
												setOpen(false)
											}}
										>
											<span className="text-sm italic text-muted-foreground">Remover vinculação</span>
										</CommandItem>
									)}

									{(results as CatmatSearchItem[]).map((item) => (
										<CommandItem
											key={item.codigo_item}
											value={String(item.codigo_item)}
											onSelect={() => {
												onChange(item.codigo_item, item.descricao_item)
												setOpen(false)
												setInputValue("")
											}}
											className="flex items-start gap-2"
										>
											<Check className={cn("mt-0.5 size-4 shrink-0", value === item.codigo_item ? "opacity-100" : "opacity-0")} />
											<span className="shrink-0 font-mono text-xs text-muted-foreground">#{item.codigo_item}</span>
											<span className="flex-1 text-sm leading-snug">{item.descricao_item}</span>
											{item.item_sustentavel && <span className="mt-0.5 shrink-0 rounded bg-success/10 px-1.5 py-0.5 text-xs text-success">Sustentável</span>}
										</CommandItem>
									))}
								</CommandGroup>
							))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}
