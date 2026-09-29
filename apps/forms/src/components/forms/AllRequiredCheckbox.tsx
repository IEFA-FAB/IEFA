/**
 * "Todas obrigatórias" da seção: marcado com todas, parcial com parte, vazio sem nenhuma.
 * Clicar no parcial marca todas. Mesmo checkbox nativo do "Obrigatória" de cada pergunta.
 */
export function AllRequiredCheckbox({
	total,
	required,
	onChange,
	disabled,
}: {
	total: number
	required: number
	onChange: (required: boolean) => void
	disabled?: boolean
}) {
	const isAll = total > 0 && required >= total
	const isSome = required > 0 && !isAll
	return (
		<label className="flex items-center gap-2 text-sm text-muted-foreground">
			<input
				type="checkbox"
				ref={(el) => {
					if (el) el.indeterminate = isSome
				}}
				checked={isAll}
				disabled={disabled}
				onChange={() => onChange(!isAll)}
				className="size-3.5 border border-border accent-foreground"
			/>
			Todas obrigatórias
		</label>
	)
}
