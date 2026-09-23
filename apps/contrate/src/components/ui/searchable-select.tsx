import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { Check, NavArrowDown } from "iconoir-react"
import { useMemo, useState } from "react"

import { cn } from "../../lib/utils"

export interface SearchableSelectOption {
	value: string
	label: string
	/** Segunda linha do item: o contexto que desempata homônimos. */
	hint?: string
	/** Entra na busca sem aparecer no item — sigla, código, sinônimo. */
	keywords?: string
}

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
	 * Rótulo da opção que zera a seleção ("Todas as OMs"). Sem ele a lista não
	 * oferece como voltar a "nenhum".
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

/** Sentinela da opção "nenhuma": string vazia nunca colide com um id real. */
const NONE_VALUE = ""

/**
 * Teto de itens renderizados por vez. O ganho do combobox é a busca, não a
 * rolagem: sem o corte, uma lista grande monta o mesmo popup impraticável que o
 * `Select` que este componente substitui. O rodapé diz quantos ficaram de fora
 * — lista truncada que se anuncia é melhor do que lista que mente.
 *
 * Quem corta é o `limit` do primitivo, NÃO um `.slice()` na coleção: fatiar
 * tirava o item selecionado de `items` sempre que ele caía fora dos 50
 * primeiros, e aí o Base UI não tinha o que marcar com o check nem para onde
 * rolar ao abrir.
 */
const MAX_VISIBLE = 50

function normalize(value: string) {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
}

/** Cada palavra da busca tem de aparecer em algum lugar do item, em qualquer ordem. */
function matches(haystack: string, terms: readonly string[]) {
	if (terms.length === 0) return true
	const target = normalize(haystack)
	return terms.every((term) => target.includes(term))
}

/**
 * Select com busca, sobre o primitivo `Combobox` do Base UI.
 *
 * Use quando a lista passar de ~25 itens. Abaixo disso o `Select` continua
 * certo: o campo de busca custa um foco a mais e não paga.
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

	const hits = useMemo(() => {
		const terms = normalize(query).split(/\s+/).filter(Boolean)
		const pool = clearOption ? [clearOption, ...options] : options
		return pool.filter((option) => matches(`${option.label} ${option.hint ?? ""} ${option.keywords ?? ""}`, terms))
	}, [query, options, clearOption])

	function handleOpenChange(next: boolean) {
		setOpen(next)
		if (!next) setQuery("")
	}

	return (
		<ComboboxPrimitive.Root
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
			<ComboboxPrimitive.Trigger
				id={id}
				data-slot="searchable-select-trigger"
				aria-label={props["aria-label"]}
				aria-invalid={props["aria-invalid"]}
				className={cn(
					"border-input dark:bg-input/30 dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 flex h-8 w-full items-center justify-between gap-1.5 border bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-[3px] aria-invalid:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
					className
				)}
			>
				<span className={cn("truncate", isPlaceholder && "text-muted-foreground")}>{triggerLabel}</span>
				<ComboboxPrimitive.Icon render={<NavArrowDown className="text-muted-foreground pointer-events-none size-4 shrink-0" />} />
			</ComboboxPrimitive.Trigger>

			<ComboboxPrimitive.Portal>
				<ComboboxPrimitive.Positioner sideOffset={4} className="isolate z-50">
					<ComboboxPrimitive.Popup
						data-slot="searchable-select-content"
						className={cn(
							"bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ring-foreground/10 relative isolate z-50 flex max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) flex-col overflow-hidden shadow-md ring-1 duration-100",
							contentClassName
						)}
					>
						<ComboboxPrimitive.Input
							placeholder={searchPlaceholder}
							aria-label={searchPlaceholder}
							className="border-input placeholder:text-muted-foreground h-8 shrink-0 border-b bg-transparent px-2.5 py-1 text-sm outline-none"
						/>

						<ComboboxPrimitive.Empty className="text-muted-foreground px-2.5 py-3 text-center text-sm">{emptyLabel}</ComboboxPrimitive.Empty>

						<ComboboxPrimitive.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
							{(item: SearchableSelectOption) => (
								<ComboboxPrimitive.Item
									key={item.value}
									value={item}
									className={cn(
										"data-highlighted:bg-accent data-highlighted:text-accent-foreground relative flex w-full items-center gap-1.5 py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50",
										item.hint && "items-start"
									)}
								>
									<span className="min-w-0 flex-1">
										<span className="block truncate">{item.label}</span>
										{item.hint ? <span className="text-muted-foreground block truncate text-xs">{item.hint}</span> : null}
									</span>
									<ComboboxPrimitive.ItemIndicator render={<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />}>
										<Check className="pointer-events-none size-4" />
									</ComboboxPrimitive.ItemIndicator>
								</ComboboxPrimitive.Item>
							)}
						</ComboboxPrimitive.List>

						{/* Região aria-live: condicione os FILHOS, nunca o componente — elemento
						    desmontado sai da árvore de acessibilidade e o texto inserido depois
						    não é anunciado, que é justamente o que esta região existe para fazer. */}
						<ComboboxPrimitive.Status className="border-input text-muted-foreground shrink-0 border-t px-2.5 py-1.5 text-xs empty:border-0 empty:p-0">
							{hits.length > MAX_VISIBLE ? `Mostrando ${MAX_VISIBLE} de ${hits.length} — refine a busca.` : null}
						</ComboboxPrimitive.Status>
					</ComboboxPrimitive.Popup>
				</ComboboxPrimitive.Positioner>
			</ComboboxPrimitive.Portal>
		</ComboboxPrimitive.Root>
	)
}
