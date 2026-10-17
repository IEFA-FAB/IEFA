// Filtro pelo tipo de código genérico, com a contagem de cada tipo no próprio botão.
import { SegmentedControl } from "#/components/ui/segmented-control"
import type { GenericKindSummary } from "#/subitens/dashboard"
import { GENERIC_CODE_KINDS, GENERIC_CODE_LABELS } from "#/subitens/generic-code"
import type { GenericCodeFilter as GenericCodeFilterValue } from "#/subitens/types"

interface GenericCodeFilterProps {
	value: GenericCodeFilterValue
	onValueChange: (value: GenericCodeFilterValue) => void
	/** Ocorrências do recorte do conferente, antes deste filtro. */
	totalCount: number
	/** Contagem por tipo no mesmo recorte; ocorrência com os dois códigos conta nos dois. */
	summary: GenericKindSummary
}

export function GenericCodeFilter({ value, onValueChange, totalCount, summary }: GenericCodeFilterProps) {
	const options: { value: GenericCodeFilterValue; label: string }[] = [
		{ value: "all", label: `Todos · ${totalCount}` },
		...GENERIC_CODE_KINDS.map((kind) => ({ value: kind, label: `${GENERIC_CODE_LABELS[kind]} · ${summary[kind].count}` })),
	]
	return (
		<div className="flex flex-col gap-2">
			<span className="text-label text-muted-foreground">Filtrar por tipo de código</span>
			<SegmentedControl label="Filtrar por tipo de código" value={value} onValueChange={onValueChange} options={options} />
		</div>
	)
}
