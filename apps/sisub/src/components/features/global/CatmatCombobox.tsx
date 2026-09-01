import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Loader2, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxStatus, ComboboxTrigger } from "@/components/ui/combobox"
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

const MIN_CHARS = 3

/** Lista vazia compartilhada: literal novo a cada render invalidaria os memos do primitivo. */
const EMPTY: CatmatSearchItem[] = []

/**
 * Combobox de busca CATMAT (catálogo Compras.gov.br).
 * Debounce 400ms, mantém resultados anteriores enquanto carrega, estado de loading.
 *
 * Sobre o primitivo `Combobox` do Base UI, não sobre `Popover` + `cmdk`: o
 * campo de busca é o `role="combobox"`, com `aria-activedescendant` seguindo o
 * item destacado e `aria-controls` apontando para a lista. Na montagem anterior
 * quem tinha `role="combobox"` era o botão que abre o popup, e o input de busca
 * não tinha relação nenhuma com a lista — arrastar o cursor pelos resultados
 * não anunciava nada.
 *
 * A busca é no servidor, então `filter={null}` desliga o filtro em memória do
 * primitivo; sem isso ele filtraria de novo o que o servidor já filtrou e
 * esconderia resultado legítimo cuja descrição não contém o termo digitado.
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

	const minCharsReached = debouncedSearch.length >= MIN_CHARS
	const inputReachesMin = inputValue.trim().length >= MIN_CHARS
	const isTyping = inputReachesMin && inputValue.trim() !== debouncedSearch

	const { data: results = [], isFetching } = useQuery({
		...catmatQueryOptions(debouncedSearch),
		// Keep previous results visible while new search loads — avoids list flash
		placeholderData: keepPreviousData,
	})

	const showLoading = isTyping || (minCharsReached && isFetching)
	// `items` e `value` alimentam os memos de coleção do primitivo: literal novo
	// a cada render refaz a lista a cada tecla do formulário em volta.
	const items = useMemo(() => (inputReachesMin && !showLoading ? (results as CatmatSearchItem[]) : EMPTY), [inputReachesMin, showLoading, results])

	// O item selecionado quase nunca está na lista corrente (a lista é o
	// resultado da busca atual), então é reconstruído do par código+descrição
	// que o formulário guarda.
	const selected = useMemo<CatmatSearchItem | null>(
		() => (value === null ? null : { codigo_item: value, descricao_item: descricao ?? "", item_sustentavel: null }),
		[value, descricao]
	)

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
			value={selected}
			isItemEqualToValue={(item: CatmatSearchItem, current: CatmatSearchItem) => item.codigo_item === current.codigo_item}
			itemToStringLabel={(item: CatmatSearchItem) => item.descricao_item}
			open={open}
			onOpenChange={handleOpenChange}
			onInputValueChange={(next, { reason }) => {
				if (reason === "item-press") return
				setInputValue(next)
			}}
			onValueChange={(next) => {
				const item = next as CatmatSearchItem | null
				onChange(item?.codigo_item ?? null, item?.descricao_item ?? null)
				setOpen(false)
			}}
		>
			<div className="flex w-full items-center gap-1">
				<ComboboxTrigger render={<Button type="button" variant="outline" className="h-auto min-h-9 w-full justify-between font-normal" />}>
					{value ? (
						<span className="flex min-w-0 items-center gap-2">
							<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">#{value}</span>
							<span className="truncate text-sm">{descricao ?? "..."}</span>
						</span>
					) : (
						<span className="text-muted-foreground">Vincular código CATMAT...</span>
					)}
				</ComboboxTrigger>

				{value !== null && (
					<Button type="button" variant="ghost" size="icon-sm" aria-label="Remover vinculação CATMAT" onClick={() => onChange(null, null)}>
						<X />
					</Button>
				)}
			</div>

			<ComboboxContent className="min-w-[360px] max-w-[700px]" aria-busy={showLoading || undefined}>
				<ComboboxInput showTrigger={false} placeholder="Código (ex: 327430) ou parte da descrição..." aria-label="Buscar item do CATMAT" />

				<ComboboxStatus>
					{!inputReachesMin && "Pesquise o código ou parte da descrição."}
					{inputReachesMin && showLoading && (
						<>
							<Loader2 className="size-4 animate-spin" />
							Buscando...
						</>
					)}
				</ComboboxStatus>

				<ComboboxEmpty>{inputReachesMin && !showLoading ? `Nenhum resultado para "${debouncedSearch}".` : null}</ComboboxEmpty>

				<ComboboxList className="max-h-[300px]">
					{(item: CatmatSearchItem) => (
						<ComboboxItem key={item.codigo_item} value={item} className="items-start">
							<span className="shrink-0 font-mono text-xs text-muted-foreground">#{item.codigo_item}</span>
							<span className="flex-1 text-sm leading-snug">{item.descricao_item}</span>
							{item.item_sustentavel && <span className="mt-0.5 shrink-0 rounded bg-success/10 px-1.5 py-0.5 text-xs text-success">Sustentável</span>}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	)
}
