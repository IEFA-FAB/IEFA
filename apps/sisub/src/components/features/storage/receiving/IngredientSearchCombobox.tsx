import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxStatus, ComboboxTrigger } from "@/components/ui/combobox"
import { searchReceivableIngredientsFn } from "@/server/receiving.fn"

export interface IngredientOption {
	id: string
	description: string
	measure_unit: string | null
}

const MIN_CHARS = 2
const EMPTY: IngredientOption[] = []

/**
 * Busca de insumo no catálogo (servidor), para a linha da entrega sem nota. Mesmo molde do
 * `CatmatCombobox`: `filter={null}` porque o servidor já filtrou, e o item escolhido é
 * reconstruído do que o formulário guarda.
 */
export function IngredientSearchCombobox({
	kitchenId,
	value,
	onChange,
	id,
}: {
	kitchenId: number
	value: IngredientOption | null
	onChange: (value: IngredientOption | null) => void
	id?: string
}) {
	const [open, setOpen] = useState(false)
	const [input, setInput] = useState("")
	const [search, setSearch] = useState("")

	useEffect(() => {
		const timer = setTimeout(() => setSearch(input.trim()), 300)
		return () => clearTimeout(timer)
	}, [input])

	const enabled = search.length >= MIN_CHARS
	const { data, isFetching } = useQuery({
		queryKey: ["receiving", "ingredient-search", kitchenId, search],
		queryFn: () => searchReceivableIngredientsFn({ data: { kitchenId, query: search } }),
		enabled,
		placeholderData: keepPreviousData,
		staleTime: 60_000,
	})
	const typing = input.trim().length >= MIN_CHARS && input.trim() !== search
	const items = useMemo(() => (enabled && !typing ? (data ?? EMPTY) : EMPTY), [enabled, typing, data])

	return (
		<Combobox
			items={items}
			filter={null}
			autoHighlight
			value={value}
			open={open}
			onOpenChange={(next) => {
				setOpen(next)
				if (!next) {
					setInput("")
					setSearch("")
				}
			}}
			isItemEqualToValue={(item: IngredientOption, current: IngredientOption) => item.id === current.id}
			itemToStringLabel={(item: IngredientOption) => item.description}
			onInputValueChange={(next, { reason }) => {
				if (reason === "item-press") return
				setInput(next)
			}}
			onValueChange={(next) => {
				onChange((next as IngredientOption | null) ?? null)
				setOpen(false)
			}}
		>
			<ComboboxTrigger id={id} render={<Button type="button" variant="outline" className="w-full min-w-0 justify-between" />}>
				<span className="truncate">{value ? value.description : "Escolha o insumo"}</span>
			</ComboboxTrigger>
			<ComboboxContent aria-busy={typing || isFetching || undefined}>
				<ComboboxInput showTrigger={false} placeholder="Parte do nome do insumo" aria-label="Buscar insumo" />
				<ComboboxStatus>{input.trim().length < MIN_CHARS ? "Digite ao menos duas letras." : typing || isFetching ? "Buscando…" : null}</ComboboxStatus>
				<ComboboxEmpty>{enabled && !typing && !isFetching ? `Nenhum insumo com "${search}".` : null}</ComboboxEmpty>
				<ComboboxList>
					{(item: IngredientOption) => (
						<ComboboxItem key={item.id} value={item}>
							<span className="min-w-0 flex-1 truncate">{item.description}</span>
							{item.measure_unit && <span className="text-caption text-muted-foreground">{item.measure_unit}</span>}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	)
}
