import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxStatus, ComboboxTrigger } from "@/components/ui/combobox"
import { searchIssuableIngredientsFn } from "@/server/issue.fn"

export interface IssuableIngredient {
	id: string
	description: string
	measure_unit: string | null
}

interface IngredientSearchComboboxProps {
	id?: string
	kitchenId: number
	value: IssuableIngredient | null
	onChange: (ingredient: IssuableIngredient | null) => void
	/** Saldo disponível por insumo, para a dica de cada resultado ("sem saldo registrado"). */
	availableById: ReadonlyMap<string, number>
	disabled?: boolean
}

const MIN_CHARS = 2
const EMPTY: IssuableIngredient[] = []
const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 })

/**
 * Busca de insumo no catálogo INTEIRO, no servidor (`searchIssuableIngredientsFn`): o catálogo
 * passa de 3000 insumos, e a lista carregada inteira no navegador chegava cortada nos 1000 do
 * PostgREST. Mesmo desenho do `CatmatCombobox`: debounce, `filter={null}` (o servidor já filtrou)
 * e o item escolhido reconstruído do valor guardado.
 */
export function IngredientSearchCombobox({ id, kitchenId, value, onChange, availableById, disabled }: IngredientSearchComboboxProps) {
	const [open, setOpen] = useState(false)
	const [inputValue, setInputValue] = useState("")
	const [debounced, setDebounced] = useState("")

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(inputValue.trim()), 300)
		return () => clearTimeout(timer)
	}, [inputValue])

	const reachesMin = debounced.length >= MIN_CHARS
	const inputReachesMin = inputValue.trim().length >= MIN_CHARS
	const isTyping = inputReachesMin && inputValue.trim() !== debounced

	const { data: results = EMPTY, isFetching } = useQuery({
		queryKey: ["issuable-ingredients", kitchenId, debounced],
		queryFn: () => searchIssuableIngredientsFn({ data: { kitchenId, search: debounced } }),
		enabled: reachesMin,
		placeholderData: keepPreviousData,
		staleTime: 5 * 60_000,
	})

	const showLoading = isTyping || (reachesMin && isFetching)
	const items = useMemo(() => (inputReachesMin && !showLoading ? results : EMPTY), [inputReachesMin, showLoading, results])

	function hintFor(ingredient: IssuableIngredient): string {
		const available = availableById.get(ingredient.id) ?? 0
		return available > 0 ? `${NUM.format(available)} ${ingredient.measure_unit ?? ""}`.trim() : "sem saldo registrado"
	}

	return (
		<Combobox
			items={items}
			filter={null}
			value={value}
			isItemEqualToValue={(item: IssuableIngredient, current: IssuableIngredient) => item.id === current.id}
			itemToStringLabel={(item: IssuableIngredient) => item.description}
			open={open}
			onOpenChange={(next) => {
				setOpen(next)
				if (!next) {
					setInputValue("")
					setDebounced("")
				}
			}}
			onInputValueChange={(next, { reason }) => {
				if (reason === "item-press") return
				setInputValue(next)
			}}
			onValueChange={(next) => {
				onChange((next as IssuableIngredient | null) ?? null)
				setOpen(false)
			}}
			disabled={disabled}
		>
			<ComboboxTrigger id={id} render={<Button type="button" variant="outline" className="w-full justify-between" disabled={disabled} />}>
				<span className={value ? "truncate" : "truncate text-muted-foreground"}>{value ? value.description : "Escolha o insumo"}</span>
			</ComboboxTrigger>
			<ComboboxContent aria-busy={showLoading || undefined}>
				<ComboboxInput showTrigger={false} placeholder="Digite parte do nome do insumo…" aria-label="Buscar insumo no catálogo" />
				<ComboboxStatus>
					{!inputReachesMin && "Digite ao menos 2 letras."}
					{inputReachesMin && showLoading && (
						<>
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
							Buscando…
						</>
					)}
				</ComboboxStatus>
				<ComboboxEmpty>{inputReachesMin && !showLoading ? `Nenhum insumo com "${debounced}" no catálogo.` : null}</ComboboxEmpty>
				<ComboboxList>
					{(item: IssuableIngredient) => (
						<ComboboxItem key={item.id} value={item}>
							<span className="flex-1">{item.description}</span>
							<span className="shrink-0 text-muted-foreground">{hintFor(item)}</span>
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	)
}
