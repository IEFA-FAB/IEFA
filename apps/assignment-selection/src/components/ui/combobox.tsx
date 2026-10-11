import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { cn } from "../../lib/utils"

/**
 * Select com busca, sobre `@base-ui/react` (mesmo desenho do `sucont`).
 *
 * O campo é o próprio gatilho: digitar filtra, setas navegam, Enter escolhe o destacado.
 * `autoHighlight` é obrigatório: sem ele o Enter não tem item para confirmar e descarta
 * o que foi digitado.
 */

export interface ComboboxOption {
	value: string
	label: string
	/** Texto secundário à direita do item (não entra na busca). */
	hint?: string
}

interface ComboboxProps {
	/** Vai no campo de busca: é ele que o `<label htmlFor>` precisa alcançar. */
	id?: string
	value: string | null
	onValueChange: (value: string) => void
	items: ComboboxOption[]
	placeholder?: string
	/** Texto do estado vazio da busca. */
	emptyLabel?: string
	size?: "default" | "lg"
	disabled?: boolean
	/** Abre já com a lista à mostra (captura de tela, teste). */
	defaultOpen?: boolean
	className?: string
	"aria-label"?: string
	"aria-describedby"?: string
}

export function Combobox({
	id,
	value,
	onValueChange,
	items,
	placeholder = "Selecione…",
	emptyLabel = "Nenhum resultado",
	size = "default",
	disabled,
	defaultOpen,
	className,
	...aria
}: ComboboxProps) {
	const selected = items.find((i) => i.value === value) ?? null

	return (
		<ComboboxPrimitive.Root
			items={items}
			value={selected}
			disabled={disabled}
			defaultOpen={defaultOpen}
			autoHighlight
			// O Base UI entrega `null` ao limpar o campo. Nenhuma lista daqui tem item nulo,
			// e apagar o texto não pode virar "sem OM" por acidente: mantém o valor.
			onValueChange={(next) => {
				const picked = (next as ComboboxOption | null)?.value
				if (picked && picked !== value) onValueChange(picked)
			}}
		>
			<div data-slot="combobox" data-size={size} className={cn("group/combobox relative", className)}>
				<ComboboxPrimitive.Input
					id={id}
					placeholder={placeholder}
					aria-label={aria["aria-label"]}
					aria-describedby={aria["aria-describedby"]}
					className={cn(
						"w-full min-w-0 rounded-lg border border-input bg-background pr-9 pl-2.5 text-sm outline-none transition-colors",
						"group-data-[size=default]/combobox:h-8 group-data-[size=lg]/combobox:h-11 group-data-[size=lg]/combobox:pl-3 group-data-[size=lg]/combobox:text-base group-data-[size=lg]/combobox:font-medium",
						"placeholder:text-muted-foreground placeholder:font-normal focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
						"disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
					)}
				/>
				<ComboboxPrimitive.Trigger
					aria-label="Abrir lista"
					className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
				>
					<ComboboxPrimitive.Icon render={<ChevronDownIcon className="size-4" />} />
				</ComboboxPrimitive.Trigger>
			</div>

			<ComboboxPrimitive.Portal>
				<ComboboxPrimitive.Positioner sideOffset={4} className="isolate z-50">
					<ComboboxPrimitive.Popup
						className={cn(
							"relative z-50 max-h-[min(20rem,var(--available-height))] w-(--anchor-width) min-w-56 origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10",
							"data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 duration-100"
						)}
					>
						{/* O `Empty` fica sempre montado e só mostra os filhos sem resultado: o respiro vai no
							filho, senão abre um vão no topo da lista cheia. */}
						<ComboboxPrimitive.Empty>
							<div className="px-3 py-4 text-center text-sm text-muted-foreground">{emptyLabel}</div>
						</ComboboxPrimitive.Empty>
						<ComboboxPrimitive.List>
							{(item: ComboboxOption) => (
								<ComboboxPrimitive.Item
									key={item.value}
									value={item}
									className="relative flex w-full items-center gap-3 rounded-md py-2 pr-8 pl-2.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
								>
									<span className="flex-1 truncate">{item.label}</span>
									{item.hint && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.hint}</span>}
									<ComboboxPrimitive.ItemIndicator render={<span className="pointer-events-none absolute right-2.5 flex size-4 items-center justify-center" />}>
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
