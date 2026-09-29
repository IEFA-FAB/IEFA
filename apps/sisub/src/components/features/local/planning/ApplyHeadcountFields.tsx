import { Loader2 } from "lucide-react"
import type { ReactNode } from "react"
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { type HeadcountRow, parseHeadcountInput } from "@/lib/apply-headcounts"

/** Texto de ajuda comum: aplicar sem efetivo passa, e o número pode chegar depois. */
export const HEADCOUNT_PENDING_HINT = "Sem efetivo, o dia fica com 'efetivo a definir' e as porções são calculadas quando você informar."

/**
 * Campos de efetivo por refeição nos diálogos de aplicar ao calendário (semanal, evento, apoio).
 * O número vale só para esta aplicação: não é gravado de volta no cardápio.
 */
export function ApplyHeadcountFields({
	idPrefix,
	legend,
	description,
	rows,
	draft,
	onChange,
	unit,
	placeholderFor,
	isLoading = false,
}: {
	idPrefix: string
	legend: string
	description: ReactNode
	rows: readonly HeadcountRow[]
	draft: Readonly<Record<string, string>>
	onChange: (id: string, raw: string) => void
	/** "comensais" no semanal e no evento; "kits" no apoio. */
	unit: string
	placeholderFor: (row: HeadcountRow) => string
	isLoading?: boolean
}) {
	if (isLoading) {
		return (
			<div className="flex justify-center p-2">
				<Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Carregando as refeições do cardápio" />
			</div>
		)
	}
	if (rows.length === 0) return null

	return (
		<FieldSet>
			<FieldLegend variant="label">{legend}</FieldLegend>
			<FieldDescription>{description}</FieldDescription>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{rows.map((row) => {
					const raw = draft[row.id] ?? ""
					const isInvalid = parseHeadcountInput(raw) === "invalid"
					const inputId = `${idPrefix}-${row.id}`
					return (
						<Field key={row.id} data-invalid={isInvalid || undefined}>
							<FieldLabel htmlFor={inputId}>{row.label}</FieldLabel>
							<div className="flex items-center gap-2">
								<Input
									id={inputId}
									type="number"
									inputMode="numeric"
									min={1}
									step={1}
									value={raw}
									placeholder={placeholderFor(row)}
									aria-invalid={isInvalid || undefined}
									onChange={(e) => onChange(row.id, e.target.value)}
									className="w-44"
								/>
								<span className="text-caption text-muted-foreground">{unit}</span>
							</div>
							{isInvalid && <FieldError>Informe um número inteiro maior que zero, ou deixe vazio.</FieldError>}
						</Field>
					)
				})}
			</div>
		</FieldSet>
	)
}
