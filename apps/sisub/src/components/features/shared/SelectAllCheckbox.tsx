import { type ReactNode, useId } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/cn"

/**
 * Marcar-todos de uma lista de checkboxes: marcado com a lista inteira, parcial (traço) com
 * parte dela, vazio sem nada. Clicar no parcial marca tudo; no marcado, desmarca tudo.
 *
 * `total` e `selected` contam só os itens que o marcar-todos alcança — com busca ou filtro,
 * os visíveis e habilitados, nunca o catálogo inteiro.
 */
export function SelectAllCheckbox({
	total,
	selected,
	onChange,
	children,
	className,
}: {
	total: number
	selected: number
	onChange: (checked: boolean) => void
	children: ReactNode
	className?: string
}) {
	const id = useId()
	const isAll = total > 0 && selected >= total
	return (
		<label htmlFor={id} className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", total === 0 && "opacity-50", className)}>
			<Checkbox id={id} checked={isAll} indeterminate={selected > 0 && !isAll} disabled={total === 0} onCheckedChange={(checked) => onChange(checked)} />
			{children}
		</label>
	)
}
