import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxStatus, ComboboxTrigger } from "@/components/ui/combobox"
import { cn } from "@/lib/cn"
import { buildHits, MAX_VISIBLE, NONE_VALUE, type SearchableSelectOption } from "@/lib/searchable-select-filter"

export type { SearchableSelectOption }

interface SearchableSelectProps {
	value: string | null
	onValueChange: (value: string | null) => void
	options: readonly SearchableSelectOption[]
	id?: string
	/** Rótulo do gatilho quando nada está selecionado. */
	placeholder?: string
	searchPlaceholder?: string
	emptyLabel?: string
	/**
	 * Rótulo da opção que zera a seleção ("Todos os ranchos", "Sem item de
	 * compra"). Sem ele a lista não oferece como voltar a "nenhum".
	 */
	clearLabel?: string
	/** Rótulo quando o valor salvo não está entre as opções (apagado, fora de escopo). */
	unavailableLabel?: string
	disabled?: boolean
	className?: string
	contentClassName?: string
	"aria-label"?: string
	"aria-invalid"?: boolean
}

/**
 * Select com busca, sobre o primitivo `Combobox` do Base UI.
 *
 * Use quando a lista passar de ~25 itens — OU quando ela for curta mas os
 * rótulos não se distinguirem pelo começo. O segundo caso não é detalhe: o
 * typeahead do `Select` casa com `startsWith` (`useTypeahead`), então numa
 * lista de "Questão 7", "Questão 21", "Questão 27" digitar "27" não acha nada,
 * e a única saída é rolar comparando números. É por isso que os filtros de
 * questão do RAC no `sucont` são combobox com 20 itens, abaixo do corte.
 *
 * Abaixo do corte E com rótulos que começam diferente, o `Select` continua
 * certo: o campo de busca custa um foco a mais e não paga.
 *
 * Para lista que vive no servidor (CATMAT, tabelas nutricionais) este não é o
 * componente — veja `CatmatCombobox` e `NutritionReferenceCombobox`, que
 * buscam no servidor com `filter={null}`. Aqui a lista já está em memória e a
 * filtragem é local.
 */
export function SearchableSelect({
	value,
	onValueChange,
	options,
	id,
	placeholder = "Selecione…",
	searchPlaceholder = "Pesquisar…",
	emptyLabel = "Nenhum resultado encontrado.",
	clearLabel,
	unavailableLabel,
	disabled = false,
	className,
	contentClassName,
	...props
}: SearchableSelectProps) {
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState("")

	const clearOption = useMemo<SearchableSelectOption | null>(() => (clearLabel ? { value: NONE_VALUE, label: clearLabel } : null), [clearLabel])

	const selected = value != null && value !== NONE_VALUE ? (options.find((option) => option.value === value) ?? null) : null
	const triggerLabel = selected?.label ?? (value != null && value !== NONE_VALUE ? (unavailableLabel ?? value) : (clearLabel ?? placeholder))
	// Cinza de placeholder é só para "nada escolhido". Com `clearLabel`, o rótulo
	// no gatilho é uma escolha legítima ("Todos os Ranchos", "Utensílio de mão")
	// — e em `EquipmentCatalogManager` é um `role_id = null` gravado. Pintá-lo de
	// cinza faria filtro ativo e valor salvo lerem como campo em branco.
	const isPlaceholder = selected == null && !clearLabel

	const hits = useMemo(() => buildHits({ options, query, clearOption, selected }), [options, query, clearOption, selected])

	function handleOpenChange(next: boolean) {
		setOpen(next)
		if (!next) setQuery("")
	}

	return (
		<Combobox
			items={hits}
			limit={MAX_VISIBLE}
			// A filtragem é nossa (acento, palavra a palavra). Sem isto o primitivo
			// filtraria de novo, por cima, com outra regra.
			filter={null}
			// Sem isto, digitar e apertar Enter não escolhe nada: com a consulta
			// mudando, o primitivo não destaca ninguém, e Enter não tem o que
			// confirmar. O `Select` que este componente substitui casava por
			// digitação e confirmava com Enter — exigir ArrowDown antes seria
			// regressão. Mesma correção já feita no combobox do sucont.
			autoHighlight
			value={selected ?? clearOption}
			disabled={disabled}
			open={open}
			onOpenChange={handleOpenChange}
			isItemEqualToValue={(item: SearchableSelectOption, current: SearchableSelectOption) => item.value === current.value}
			itemToStringLabel={(item: SearchableSelectOption) => item.label}
			onInputValueChange={(next, { reason }) => {
				if (reason === "item-press") return
				setQuery(next)
			}}
			onValueChange={(next) => {
				const picked = next as SearchableSelectOption | null
				onValueChange(picked == null || picked.value === NONE_VALUE ? null : picked.value)
				setOpen(false)
			}}
		>
			<ComboboxTrigger
				render={<Button type="button" variant="outline" disabled={disabled} className={cn("h-9 w-full justify-between font-normal", className)} />}
				id={id}
				aria-label={props["aria-label"]}
				aria-invalid={props["aria-invalid"]}
			>
				<span className={cn("truncate", isPlaceholder && "text-muted-foreground")}>{triggerLabel}</span>
			</ComboboxTrigger>

			<ComboboxContent className={contentClassName}>
				<ComboboxInput showTrigger={false} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />

				<ComboboxEmpty>{emptyLabel}</ComboboxEmpty>

				<ComboboxList>
					{(item: SearchableSelectOption) => (
						<ComboboxItem key={item.value} value={item} className={item.hint ? "items-start" : undefined}>
							<span className="min-w-0 flex-1">
								<span className="block truncate">{item.label}</span>
								{item.hint ? <span className="block truncate text-xs text-muted-foreground">{item.hint}</span> : null}
							</span>
						</ComboboxItem>
					)}
				</ComboboxList>

				<ComboboxStatus>{hits.length > MAX_VISIBLE ? `Mostrando ${MAX_VISIBLE} de ${hits.length} — refine a busca.` : null}</ComboboxStatus>
			</ComboboxContent>
		</Combobox>
	)
}
