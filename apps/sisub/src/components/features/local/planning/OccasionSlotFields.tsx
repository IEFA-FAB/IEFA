import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** Uma refeição do cardápio e o horário que ela sugere. */
export type OccasionSlotRow = { id: string; label: string; suggestedMealTypeId: string }

/** Texto comum: formato de serviço não é horário. */
export const OCCASION_SLOT_HINT = "Formato não é horário: o coquetel pode ir ao almoço ou à noite. Vem o horário sugerido pelo cardápio; troque se for outro."

/**
 * Horário de cada refeição ao aplicar ou montar um evento. O cardápio só sugere o horário; quem
 * decide é a cozinha, e o escolhido aqui não volta para o modelo. Fica sempre visível ao lado do
 * efetivo, para a sugestão não passar batida.
 */
export function OccasionSlotFields({
	idPrefix,
	rows,
	mealTypes,
	value,
	onChange,
	legend = "Horário de cada refeição",
	description = OCCASION_SLOT_HINT,
}: {
	idPrefix: string
	rows: readonly OccasionSlotRow[]
	mealTypes: readonly { id: string; name: string | null }[] | undefined
	/** Horário escolhido por refeição; ausente = o sugerido. */
	value: Readonly<Record<string, string>>
	onChange: (mealId: string, mealTypeId: string) => void
	legend?: string
	description?: string
}) {
	if (rows.length === 0) return null
	const nameOf = (id: string) => mealTypes?.find((mt) => mt.id === id)?.name ?? "Horário do cardápio"
	return (
		<FieldSet>
			<FieldLegend variant="label">{legend}</FieldLegend>
			<FieldDescription>{description}</FieldDescription>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{rows.map((row) => {
					const current = value[row.id] ?? row.suggestedMealTypeId
					const id = `${idPrefix}-${row.id}`
					// O horário sugerido pode não estar na lista desta cozinha (tipo de refeição de outra
					// cozinha, removido): ele entra como opção para o campo não aparecer vazio.
					const options = mealTypes?.some((mt) => mt.id === row.suggestedMealTypeId)
						? mealTypes
						: [...(mealTypes ?? []), { id: row.suggestedMealTypeId, name: "Horário do cardápio" }]
					return (
						<Field key={row.id}>
							<FieldLabel htmlFor={id}>{row.label}</FieldLabel>
							<Select value={current ?? null} onValueChange={(next) => next && onChange(row.id, next)}>
								<SelectTrigger id={id} className="w-44">
									<SelectValue>{nameOf(current)}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{options.map((mt) => (
										<SelectItem key={mt.id} value={mt.id}>
											{mt.name ?? "Refeição"}
											{mt.id === row.suggestedMealTypeId ? " (sugerido)" : ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					)
				})}
			</div>
		</FieldSet>
	)
}

/** Só vai o horário que difere do sugerido; `undefined` quando nada mudou. */
export function occasionSlotsPayload(rows: readonly OccasionSlotRow[], value: Readonly<Record<string, string>>) {
	const slots = rows.flatMap((row) => {
		const chosen = value[row.id]
		return chosen && chosen !== row.suggestedMealTypeId ? [{ occasionMealId: row.id, mealTypeId: chosen }] : []
	})
	return slots.length > 0 ? slots : undefined
}
