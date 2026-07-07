import type { NutritionReferenceFoodSearchItem, NutritionReferenceSummary } from "@iefa/sisub-domain"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { buttonVariants } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/cn"
import { nutritionReferenceFoodsQueryOptions } from "@/services/IngredientsService"

interface NutritionReferenceComboboxProps {
	value: NutritionReferenceSummary | null
	onChange: (value: NutritionReferenceSummary | null) => void
}

export function NutritionReferenceCombobox({ value, onChange }: NutritionReferenceComboboxProps) {
	const [open, setOpen] = useState(false)
	const [inputValue, setInputValue] = useState("")
	const [debouncedSearch, setDebouncedSearch] = useState("")

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(inputValue.trim()), 400)
		return () => clearTimeout(timer)
	}, [inputValue])

	const inputReachesMin = inputValue.trim().length >= 2
	const isTyping = inputReachesMin && inputValue.trim() !== debouncedSearch
	const { data: results = [], isFetching } = useQuery({
		...nutritionReferenceFoodsQueryOptions(debouncedSearch),
		placeholderData: keepPreviousData,
	})
	const showLoading = isTyping || (debouncedSearch.length >= 2 && isFetching)

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
				aria-controls="nutrition-reference-combobox-popup"
				className={cn(buttonVariants({ variant: "outline" }), "h-auto min-h-9 w-full justify-between font-normal")}
			>
				{value ? (
					<span className="flex min-w-0 items-center gap-2">
						<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{value.source_name}</span>
						<span className="truncate text-sm">{value.display_name}</span>
						<span className="shrink-0 font-mono text-xs text-muted-foreground">{value.external_code}</span>
					</span>
				) : (
					<span className="text-muted-foreground">Dados manuais</span>
				)}
				<ChevronsUpDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
			</PopoverTrigger>

			<PopoverContent
				id="nutrition-reference-combobox-popup"
				className="p-0"
				style={{ width: "var(--radix-popover-trigger-width)", minWidth: "420px", maxWidth: "760px" }}
				align="start"
			>
				<Command shouldFilter={false}>
					<CommandInput placeholder="Buscar alimento, código ou grupo..." value={inputValue} onValueChange={setInputValue} />
					<CommandList className="max-h-[340px]">
						{/* Remover vínculo — sempre disponível quando há tabela vinculada, sem depender de busca. */}
						{value && (
							<CommandGroup>
								<CommandItem
									value="__CLEAR__"
									onSelect={() => {
										onChange(null)
										setOpen(false)
										setInputValue("")
									}}
								>
									<span className="text-sm italic text-muted-foreground">Remover vínculo · usar dados manuais</span>
								</CommandItem>
							</CommandGroup>
						)}

						{inputValue.trim().length < 2 && <div className="py-6 text-center text-sm text-muted-foreground">Pesquise por nome, código ou grupo.</div>}

						{inputValue.trim().length >= 2 && showLoading && (
							<div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
								<Loader2 className="size-4 animate-spin" />
								Buscando...
							</div>
						)}

						{inputValue.trim().length >= 2 &&
							!showLoading &&
							(results.length === 0 ? (
								<CommandEmpty>Nenhum resultado para "{debouncedSearch}".</CommandEmpty>
							) : (
								<CommandGroup>
									{(results as NutritionReferenceFoodSearchItem[]).map((item) => (
										<CommandItem
											key={item.food_revision_id}
											value={`${item.source_name} ${item.external_code} ${item.display_name} ${item.group_name ?? ""}`}
											onSelect={() => {
												onChange(item)
												setOpen(false)
												setInputValue("")
											}}
											className="flex items-start gap-2"
										>
											<Check className={cn("mt-0.5 size-4 shrink-0", value?.food_revision_id === item.food_revision_id ? "opacity-100" : "opacity-0")} />
											<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{item.source_name}</span>
											<span className="min-w-0 flex-1">
												<span className="block truncate text-sm leading-snug">{item.display_name}</span>
												<span className="block truncate text-xs text-muted-foreground">
													{item.group_name ?? "Sem grupo"} · {item.version_label} · {item.base_quantity} {item.base_unit}
												</span>
											</span>
											<span className="shrink-0 font-mono text-xs text-muted-foreground">{item.external_code}</span>
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
