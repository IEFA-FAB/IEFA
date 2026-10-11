import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import type { OmOption } from "@/lib/om-options"

interface OmComboboxProps {
	id?: string
	value: string | null
	/** De `toOmItems`, memoizado por quem chama: a mesma referência mantém o item selecionado estável. */
	items: ComboboxOption[]
	onChange: (om: string) => void
	size?: "default" | "lg"
	disabled?: boolean
	defaultOpen?: boolean
	className?: string
	"aria-label"?: string
	"aria-describedby"?: string
}

/** Contagem do quadro ao lado de cada OM. Só informa: OM cheia continua escolhível. */
export function toOmItems(options: readonly OmOption[]): ComboboxOption[] {
	return options.map((o) => ({
		value: o.value,
		label: o.label,
		hint: o.total === null ? undefined : `${o.confirmed} de ${o.total}`,
	}))
}

export function OmCombobox({ onChange, ...props }: OmComboboxProps) {
	return <Combobox {...props} onValueChange={onChange} placeholder="Sem OM · buscar…" emptyLabel="Nenhuma OM com esse nome" />
}
