import { SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"

/** Um interruptor do popover "Opções" da busca: rótulo + estado persistido pela tela. */
export interface SearchOption {
	/** `useId()` da tela — liga o `<label>` ao `<Switch>`. */
	id: string
	label: string
	checked: boolean
	onCheckedChange: (checked: boolean) => void
}

/**
 * Popover "Opções" das barras de busca das árvores (insumos e preparações). O ponto no
 * gatilho acende quando qualquer opção está ligada: é o único sinal, com o popover
 * fechado, de que a busca está recortada.
 */
export function SearchOptionsPopover({ options }: { options: SearchOption[] }) {
	return (
		<Popover>
			<PopoverTrigger render={<Button variant="outline" size="sm" className="shrink-0" aria-label="Opções de busca" />}>
				<SlidersHorizontal className="size-4" />
				<span className="hidden sm:inline">Opções</span>
				{options.some((option) => option.checked) && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64">
				<div className="flex flex-col gap-3 text-sm">
					{options.map((option) => (
						<label key={option.id} htmlFor={option.id} className="flex items-center justify-between gap-3 cursor-pointer select-none">
							{option.label}
							<Switch id={option.id} checked={option.checked} onCheckedChange={option.onCheckedChange} size="sm" />
						</label>
					))}
				</div>
			</PopoverContent>
		</Popover>
	)
}
