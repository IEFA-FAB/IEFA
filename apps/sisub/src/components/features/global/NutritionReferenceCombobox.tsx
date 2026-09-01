import type { NutritionReferenceFoodSearchItem, NutritionReferenceSummary } from "@iefa/sisub-domain"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Loader2, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxStatus, ComboboxTrigger } from "@/components/ui/combobox"
import { nutritionReferenceFoodsQueryOptions } from "@/services/IngredientsService"

interface NutritionReferenceComboboxProps {
	value: NutritionReferenceSummary | null
	onChange: (value: NutritionReferenceSummary | null) => void
}

const MIN_CHARS = 2

/**
 * Busca de alimento em tabela de referência (TACO, IBGE, USDA).
 *
 * Sobre o primitivo `Combobox` do Base UI — ver o comentário de
 * `CatmatCombobox`, que explica por que `Popover` + `cmdk` não servia e por que
 * `filter={null}` é obrigatório com busca no servidor.
 */
export function NutritionReferenceCombobox({ value, onChange }: NutritionReferenceComboboxProps) {
	const [open, setOpen] = useState(false)
	const [inputValue, setInputValue] = useState("")
	const [debouncedSearch, setDebouncedSearch] = useState("")

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(inputValue.trim()), 400)
		return () => clearTimeout(timer)
	}, [inputValue])

	const inputReachesMin = inputValue.trim().length >= MIN_CHARS
	const isTyping = inputReachesMin && inputValue.trim() !== debouncedSearch
	const { data: results = [], isFetching } = useQuery({
		...nutritionReferenceFoodsQueryOptions(debouncedSearch),
		placeholderData: keepPreviousData,
	})
	const showLoading = isTyping || (debouncedSearch.length >= MIN_CHARS && isFetching)
	const items = inputReachesMin && !showLoading ? (results as NutritionReferenceFoodSearchItem[]) : []

	function handleOpenChange(next: boolean) {
		setOpen(next)
		if (!next) {
			setInputValue("")
			setDebouncedSearch("")
		}
	}

	return (
		<Combobox
			items={items}
			filter={null}
			value={value}
			isItemEqualToValue={(item: NutritionReferenceSummary, current: NutritionReferenceSummary) => item.food_revision_id === current.food_revision_id}
			itemToStringLabel={(item: NutritionReferenceSummary) => item.display_name}
			open={open}
			onOpenChange={handleOpenChange}
			onInputValueChange={(next, { reason }) => {
				if (reason === "item-press") return
				setInputValue(next)
			}}
			onValueChange={(next) => {
				onChange(next as NutritionReferenceSummary | null)
				setOpen(false)
			}}
		>
			<div className="flex w-full items-center gap-1">
				<ComboboxTrigger render={<Button type="button" variant="outline" className="h-auto min-h-9 w-full justify-between font-normal" />}>
					{value ? (
						<span className="flex min-w-0 items-center gap-2">
							<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{value.source_name}</span>
							<span className="truncate text-sm">{value.display_name}</span>
							<span className="shrink-0 font-mono text-xs text-muted-foreground">{value.external_code}</span>
						</span>
					) : (
						<span className="text-muted-foreground">Dados manuais</span>
					)}
				</ComboboxTrigger>

				{value && (
					<Button type="button" variant="ghost" size="icon-sm" aria-label="Remover vínculo · usar dados manuais" onClick={() => onChange(null)}>
						<X />
					</Button>
				)}
			</div>

			<ComboboxContent className="min-w-[420px] max-w-[760px]" aria-busy={showLoading || undefined}>
				<ComboboxInput showTrigger={false} placeholder="Buscar alimento, código ou grupo..." aria-label="Buscar alimento em tabela de referência" />

				<ComboboxStatus>
					{!inputReachesMin && "Pesquise por nome, código ou grupo."}
					{inputReachesMin && showLoading && (
						<>
							<Loader2 className="size-4 animate-spin" />
							Buscando...
						</>
					)}
				</ComboboxStatus>

				<ComboboxEmpty>{inputReachesMin && !showLoading ? `Nenhum resultado para "${debouncedSearch}".` : null}</ComboboxEmpty>

				<ComboboxList className="max-h-[340px]">
					{(item: NutritionReferenceFoodSearchItem) => (
						<ComboboxItem key={item.food_revision_id} value={item} className="items-start">
							<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{item.source_name}</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm leading-snug">{item.display_name}</span>
								<span className="block truncate text-xs text-muted-foreground">
									{item.group_name ?? "Sem grupo"} · {item.version_label} · {item.base_quantity} {item.base_unit}
								</span>
							</span>
							<span className="shrink-0 font-mono text-xs text-muted-foreground">{item.external_code}</span>
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	)
}
