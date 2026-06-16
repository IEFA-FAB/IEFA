import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react"
import { useMemo } from "react"
import { cn } from "../../lib/utils"

/** Opção de um combobox: `value` identifica, `label` é o texto exibido e usado na busca. */
export type ComboboxOption = { value: string; label: string }

/**
 * Combobox de seleção única com busca por texto (Base UI Combobox).
 * Drop-in para listas grandes (centenas de itens) onde o `<Select>` é inviável.
 * Estado controlado por `value: string | null` — `null` = sem seleção.
 * A filtragem é feita pelo `label`, então inclua no label tudo que deve ser pesquisável.
 */
export function Combobox({
	items,
	value,
	onValueChange,
	placeholder = "Selecione…",
	emptyText = "Nada encontrado.",
	disabled,
	clearable = true,
	id,
	className,
}: {
	items: ComboboxOption[]
	value: string | null
	onValueChange: (value: string | null) => void
	placeholder?: string
	emptyText?: string
	disabled?: boolean
	clearable?: boolean
	id?: string
	className?: string
}) {
	const selected = useMemo(() => items.find((i) => i.value === value) ?? null, [items, value])

	return (
		<ComboboxPrimitive.Root
			items={items}
			value={selected}
			onValueChange={(v: ComboboxOption | null) => onValueChange(v?.value ?? null)}
			isItemEqualToValue={(a: ComboboxOption, b: ComboboxOption) => a.value === b.value}
			itemToStringLabel={(item: ComboboxOption) => item.label}
			disabled={disabled}
			openOnInputClick
		>
			<div className={cn("relative flex items-center", className)}>
				<ComboboxPrimitive.Input
					id={id}
					placeholder={placeholder}
					className={cn(
						"border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 w-full rounded-lg border bg-background py-2 pr-14 pl-2.5 text-sm transition-colors outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-muted-foreground"
					)}
				/>
				<div className="absolute right-1.5 flex items-center gap-0.5">
					{clearable && value != null && (
						<ComboboxPrimitive.Clear
							aria-label="Limpar"
							className="text-muted-foreground hover:text-foreground flex size-5 cursor-pointer items-center justify-center rounded-md outline-none"
						>
							<XIcon className="size-3.5" />
						</ComboboxPrimitive.Clear>
					)}
					<ComboboxPrimitive.Icon className="text-muted-foreground pointer-events-none flex size-5 items-center justify-center">
						<ChevronDownIcon className="size-4" />
					</ComboboxPrimitive.Icon>
				</div>
			</div>

			<ComboboxPrimitive.Portal>
				<ComboboxPrimitive.Positioner sideOffset={4} className="isolate z-50">
					<ComboboxPrimitive.Popup className="bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ring-foreground/10 max-h-(--available-height) w-(--anchor-width) min-w-48 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg p-1 shadow-md ring-1 duration-100">
						<ComboboxPrimitive.Empty className="text-muted-foreground px-2.5 py-2 text-sm">{emptyText}</ComboboxPrimitive.Empty>
						<ComboboxPrimitive.List>
							{(item: ComboboxOption) => (
								<ComboboxPrimitive.Item
									key={item.value}
									value={item}
									className="data-highlighted:bg-accent data-highlighted:text-accent-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-md py-1.5 pr-8 pl-2.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50"
								>
									<span className="flex-1">{item.label}</span>
									<ComboboxPrimitive.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
										<CheckIcon className="size-4" />
									</ComboboxPrimitive.ItemIndicator>
								</ComboboxPrimitive.Item>
							)}
						</ComboboxPrimitive.List>
					</ComboboxPrimitive.Popup>
				</ComboboxPrimitive.Positioner>
			</ComboboxPrimitive.Portal>
		</ComboboxPrimitive.Root>
	)
}
