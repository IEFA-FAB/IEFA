import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox"
import { cn } from "@/lib/cn"

export type ComboOption = { id: string; label: string; hint?: string }

function normalize(value: string) {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
}

/** Cada palavra da busca aparece no rótulo ou na dica, sem acento, em qualquer ordem. */
function matches(option: ComboOption, query: string) {
	const terms = normalize(query).split(/\s+/).filter(Boolean)
	const target = normalize(`${option.label} ${option.hint ?? ""}`)
	return terms.every((term) => target.includes(term))
}

/**
 * Seletor com busca para lista longa (OMs, itens, posições): o `<select>` não serve a partir de
 * ~25 opções (`.claude/rules/ui.md`). `autoHighlight` para o Enter escolher; o corte é `limit`.
 */
export function OptionCombobox({
	value,
	onChange,
	options,
	placeholder,
	searchPlaceholder = "Pesquisar...",
	emptyLabel = "Nada encontrado.",
	disabled,
	className,
}: {
	value: string | null
	onChange: (id: string | null) => void
	options: ComboOption[]
	placeholder: string
	searchPlaceholder?: string
	emptyLabel?: string
	disabled?: boolean
	className?: string
}) {
	const [open, setOpen] = useState(false)
	const selected = useMemo(() => (value ? (options.find((option) => option.id === value) ?? null) : null), [value, options])

	return (
		<Combobox
			items={options}
			value={selected}
			autoHighlight
			limit={200}
			isItemEqualToValue={(item: ComboOption, current: ComboOption) => item.id === current.id}
			itemToStringLabel={(item: ComboOption) => item.label}
			filter={(item: ComboOption, query) => matches(item, query)}
			open={open}
			onOpenChange={setOpen}
			onValueChange={(next) => {
				onChange((next as ComboOption | null)?.id ?? null)
				setOpen(false)
			}}
			disabled={disabled}
		>
			<ComboboxTrigger render={<Button type="button" variant="outline" className={cn("w-full justify-between", className)} />}>
				<span className="truncate">{selected?.label ?? placeholder}</span>
			</ComboboxTrigger>
			<ComboboxContent className="min-w-[320px]">
				<ComboboxInput showTrigger={false} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
				<ComboboxEmpty>{emptyLabel}</ComboboxEmpty>
				<ComboboxList className="max-h-80">
					{(item: ComboOption) => (
						<ComboboxItem key={item.id} value={item} className={cn(item.hint && "items-start")}>
							<span className="min-w-0">
								<span className="block truncate">{item.label}</span>
								{item.hint && <span className="block truncate text-caption text-muted-foreground">{item.hint}</span>}
							</span>
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	)
}
