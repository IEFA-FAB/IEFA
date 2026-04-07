import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { KitchenSelectionState } from "@/types/domain/ata"

// day_of_week: 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb, 7=Dom
const WEEKDAY_GROUPS = {
	weekdays: [1, 2, 3, 4], // Seg-Qui
	friday: [5], // Sexta
	weekend: [6, 7], // Sáb-Dom
}

interface HeadcountRow {
	kitchenName: string
	weekdays: number | null
	friday: number | null
	weekend: number | null
}

interface HeadcountSummaryTableProps {
	kitchenSelections: KitchenSelectionState[]
	/**
	 * Mapa de templateId → items do template (com day_of_week e headcount_override)
	 * Buscados pelo componente pai via useTemplate
	 */
	templateItemsMap: Map<
		string,
		Array<{
			day_of_week: number | null
			headcount_override: number | null
		}>
	>
	templateMap: Map<string, { default_headcount: number }>
}

function avgHeadcount(values: number[]): number | null {
	if (values.length === 0) return null
	return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

export function HeadcountSummaryTable({ kitchenSelections, templateItemsMap, templateMap }: HeadcountSummaryTableProps) {
	const rows: HeadcountRow[] = kitchenSelections.map((ks) => {
		const allSelections = [...ks.templateSelections, ...ks.eventSelections]

		// Coletar headcounts por grupo de dia
		const weekdayHC: number[] = []
		const fridayHC: number[] = []
		const weekendHC: number[] = []

		for (const sel of allSelections) {
			const items = templateItemsMap.get(sel.templateId) || []
			const templateDefault = templateMap.get(sel.templateId)?.default_headcount ?? sel.defaultHeadcount

			for (const item of items) {
				if (!item.day_of_week) continue
				const hc = item.headcount_override ?? templateDefault

				if (WEEKDAY_GROUPS.weekdays.includes(item.day_of_week)) weekdayHC.push(hc)
				else if (WEEKDAY_GROUPS.friday.includes(item.day_of_week)) fridayHC.push(hc)
				else if (WEEKDAY_GROUPS.weekend.includes(item.day_of_week)) weekendHC.push(hc)
			}

			// Se nenhum item tem day_of_week (ex: evento), usar headcount padrão para todas as categorias
			if (items.every((i) => !i.day_of_week) && items.length > 0) {
				weekdayHC.push(templateDefault)
			}
		}

		return {
			kitchenName: ks.kitchenName,
			weekdays: avgHeadcount(weekdayHC),
			friday: avgHeadcount(fridayHC),
			weekend: avgHeadcount(weekendHC),
		}
	})

	const hasData = rows.some((r) => r.weekdays !== null || r.friday !== null || r.weekend !== null)

	if (!hasData) return null

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-sm font-semibold">Média de Comensais Prevista por Período</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Cozinha</TableHead>
								<TableHead className="text-center">Seg–Qui</TableHead>
								<TableHead className="text-center">Sexta</TableHead>
								<TableHead className="text-center">Sáb–Dom</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.kitchenName}>
									<TableCell className="font-medium">{row.kitchenName}</TableCell>
									<TableCell className="text-center tabular-nums">
										{row.weekdays !== null ? <span>{row.weekdays}p</span> : <span className="text-muted-foreground">—</span>}
									</TableCell>
									<TableCell className="text-center tabular-nums">
										{row.friday !== null ? <span>{row.friday}p</span> : <span className="text-muted-foreground">—</span>}
									</TableCell>
									<TableCell className="text-center tabular-nums">
										{row.weekend !== null ? <span>{row.weekend}p</span> : <span className="text-muted-foreground">—</span>}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	)
}
