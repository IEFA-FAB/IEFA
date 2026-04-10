import { Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// day_of_week: 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb, 7=Dom
const WEEKDAY_GROUPS = {
	weekdays: [1, 2, 3, 4], // Seg-Qui
	friday: [5], // Sexta
	weekend: [6, 7], // Sáb-Dom
}

interface TemplateItemHeadcount {
	day_of_week: number | null
	headcount_override: number | null
}

interface HeadcountRow {
	kitchenName: string
	templateName: string
	weekdays: number | null
	friday: number | null
	weekend: number | null
	filled: number
	total: number
}

interface HeadcountSummaryTableProps {
	/**
	 * Seleções por cozinha com os itens de cada template (dia + headcount_override).
	 * Fornecidos pelo componente pai após fetchear os items dos templates selecionados.
	 */
	rows: HeadcountRow[]
}

function avgHeadcount(values: number[]): number | null {
	if (values.length === 0) return null
	return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

/**
 * Calcula estatísticas de headcount a partir dos itens de um template.
 */
export function calcHeadcountRow(kitchenName: string, templateName: string, items: TemplateItemHeadcount[]): HeadcountRow {
	const weekdayHC: number[] = []
	const fridayHC: number[] = []
	const weekendHC: number[] = []

	for (const item of items) {
		if (!item.day_of_week || !item.headcount_override) continue
		if (WEEKDAY_GROUPS.weekdays.includes(item.day_of_week)) weekdayHC.push(item.headcount_override)
		else if (WEEKDAY_GROUPS.friday.includes(item.day_of_week)) fridayHC.push(item.headcount_override)
		else if (WEEKDAY_GROUPS.weekend.includes(item.day_of_week)) weekendHC.push(item.headcount_override)
	}

	return {
		kitchenName,
		templateName,
		weekdays: avgHeadcount(weekdayHC),
		friday: avgHeadcount(fridayHC),
		weekend: avgHeadcount(weekendHC),
		filled: items.filter((i) => i.headcount_override !== null).length,
		total: items.length,
	}
}

export function HeadcountSummaryTable({ rows }: HeadcountSummaryTableProps) {
	if (rows.length === 0) return null

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-sm font-semibold flex items-center gap-2">
					<Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
					Comensais por Cardápio e Período
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Cozinha / Cardápio</TableHead>
								<TableHead className="text-center">Seg–Qui</TableHead>
								<TableHead className="text-center">Sexta</TableHead>
								<TableHead className="text-center">Sáb–Dom</TableHead>
								<TableHead className="text-center">Preenchido</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row, i) => (
								<TableRow key={i}>
									<TableCell>
										<p className="text-sm font-medium">{row.templateName}</p>
										<p className="text-xs text-muted-foreground">{row.kitchenName}</p>
									</TableCell>
									<TableCell className="text-center tabular-nums text-xs">
										{row.weekdays !== null ? <span>{row.weekdays} com.</span> : <span className="text-muted-foreground">—</span>}
									</TableCell>
									<TableCell className="text-center tabular-nums text-xs">
										{row.friday !== null ? <span>{row.friday} com.</span> : <span className="text-muted-foreground">—</span>}
									</TableCell>
									<TableCell className="text-center tabular-nums text-xs">
										{row.weekend !== null ? <span>{row.weekend} com.</span> : <span className="text-muted-foreground">—</span>}
									</TableCell>
									<TableCell className="text-center text-xs">
										{row.total === 0 ? (
											<span className="text-muted-foreground">—</span>
										) : row.filled === row.total ? (
											<span className="text-success font-medium">
												{row.filled}/{row.total}
											</span>
										) : (
											<span className="text-destructive font-medium">
												{row.filled}/{row.total}
											</span>
										)}
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
