import { useState } from "react"

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

/**
 * "Obrigatória" de uma pergunta já gravada. Controlado com estado otimista: o clique aparece na
 * hora e o valor do servidor (depois do "Todas obrigatórias" da seção, ou de outro editor)
 * substitui o local quando muda. Remontar por `key` fazia o mesmo, mas jogava fora o foco.
 */
export function QuestionRequiredCheckbox({ value, onChange }: { value: boolean; onChange: (required: boolean) => void }) {
	const [checked, setChecked] = useState(value)
	const [serverValue, setServerValue] = useState(value)
	if (value !== serverValue) {
		setServerValue(value)
		setChecked(value)
	}
	return (
		<label className="flex items-center gap-2 text-sm">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => {
					setChecked(e.target.checked)
					onChange(e.target.checked)
				}}
				className="size-3.5 border border-border accent-foreground"
			/>
			Obrigatória
		</label>
	)
}
