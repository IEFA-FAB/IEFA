import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { cn } from "#/lib/utils"

/**
 * Select com busca, sobre `@base-ui/react`.
 *
 * Existe para aposentar `auditor/components/CustomSelect.tsx`, um combobox
 * reescrito à mão: sem `role="listbox"`, sem `aria-activedescendant`, sem
 * navegação por setas, sem anúncio de resultado — e a dois diretórios do
 * primitivo. O que justificava a reescrita era o campo de busca, que o `Select`
 * não tem; o Combobox tem, e acessível.
 *
 * Use quando a lista for longa o bastante para procurar (as ~84 UGs do auditor).
 * Para lista curta e fechada, `Select` continua sendo o certo.
 */

export interface ComboboxOption {
	value: string
	label: string
}

interface ComboboxProps {
	value: string
	onValueChange: (value: string) => void
	items: ComboboxOption[]
	placeholder?: string
	/** Texto do estado vazio da busca. */
	emptyLabel?: string
	className?: string
	"aria-label"?: string
}

export function Combobox({ value, onValueChange, items, placeholder = "Selecione…", emptyLabel = "Nenhum resultado", className, ...props }: ComboboxProps) {
	const selected = items.find((i) => i.value === value) ?? null

	return (
		<ComboboxPrimitive.Root
			items={items}
			value={selected}
			// Sem isto, digitar "34" e apertar Enter descarta o texto e volta ao valor
			// anterior: nada fica destacado, então Enter não tem o que confirmar. Exigir
			// ArrowDown antes seria uma regressão diante das pílulas que este controle
			// substituiu, onde Enter sempre funcionou.
			autoHighlight
			// O Base UI entrega `null` ao limpar. Nenhuma lista daqui tem item nulo,
			// mas o tipo exige tratar — e cair em "" criaria um filtro que não casa
			// com nada.
			onValueChange={(next) => onValueChange((next as ComboboxOption | null)?.value ?? value)}
		>
			<div className={cn("relative", className)}>
				<ComboboxPrimitive.Input
					placeholder={placeholder}
					aria-label={props["aria-label"]}
					className={cn(
						"h-9 w-full min-w-0 cursor-pointer rounded-md border border-input bg-transparent py-1 pr-8 pl-3 text-sm shadow-xs outline-none transition-[color,box-shadow]",
						"placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
						"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
					)}
				/>
				<ComboboxPrimitive.Trigger
					aria-label="Abrir lista"
					className="absolute inset-y-0 right-0 flex w-8 cursor-pointer items-center justify-center text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					<ComboboxPrimitive.Icon render={<ChevronDownIcon className="size-4 opacity-50" />} />
				</ComboboxPrimitive.Trigger>
			</div>

			<ComboboxPrimitive.Portal>
				<ComboboxPrimitive.Positioner sideOffset={4} className="isolate z-50">
					<ComboboxPrimitive.Popup
						className={cn(
							"relative z-50 max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-md bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-border",
							"data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
						)}
					>
						<ComboboxPrimitive.Empty className="px-3 py-4 text-center text-caption text-muted-foreground">{emptyLabel}</ComboboxPrimitive.Empty>
						<ComboboxPrimitive.List>
							{(item: ComboboxOption) => (
								<ComboboxPrimitive.Item
									key={item.value}
									value={item}
									className={cn(
										"relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none",
										"data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
									)}
								>
									<span className="flex-1 truncate">{item.label}</span>
									<ComboboxPrimitive.ItemIndicator render={<span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center" />}>
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
