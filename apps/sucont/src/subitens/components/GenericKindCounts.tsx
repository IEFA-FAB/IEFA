// Ocorrências por tipo de código genérico, nas linhas de resumo dos cards de mensagem.
import { summarizeByGenericKind } from "#/subitens/dashboard"
import { GENERIC_CODE_KINDS, GENERIC_CODE_LABELS } from "#/subitens/generic-code"
import type { ProcessedData } from "#/subitens/types"

/** Uma linha por tipo, nas mesmas classes das linhas vizinhas do card; tipo sem ocorrência some. */
export function GenericKindCounts({ occurrences }: { occurrences: ProcessedData[] }) {
	const summary = summarizeByGenericKind(occurrences)
	return GENERIC_CODE_KINDS.filter((kind) => summary[kind].count > 0).map((kind) => (
		<div key={kind} className="flex justify-between items-center text-body">
			<span className="text-muted-foreground">{GENERIC_CODE_LABELS[kind]}</span>
			<span className="font-mono font-bold text-foreground">{summary[kind].count}</span>
		</div>
	))
}
