import { AreaChart, BarChart2, LineChart, PieChart, Table2 } from "lucide-react"
import type { ComponentType } from "react"
import { cn } from "@/lib/cn"
import type { ChartType } from "@/types/domain/analytics-chat"

const CHART_TYPES: { type: ChartType; label: string; Icon: ComponentType<{ className?: string }> }[] = [
	{ type: "bar", label: "Barras", Icon: BarChart2 },
	{ type: "line", label: "Linha", Icon: LineChart },
	{ type: "area", label: "Área", Icon: AreaChart },
	{ type: "pie", label: "Pizza", Icon: PieChart },
	{ type: "table", label: "Tabela", Icon: Table2 },
]

interface ChartTypeSelectorProps {
	value: ChartType
	onChange: (type: ChartType) => void
}

export function ChartTypeSelector({ value, onChange }: ChartTypeSelectorProps) {
	return (
		<div className="flex flex-wrap items-center gap-1">
			{CHART_TYPES.map(({ type, label, Icon }) => (
				<button
					key={type}
					type="button"
					onClick={() => onChange(type)}
					className={cn(
						"inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
						"border",
						value === type
							? "bg-primary text-primary-foreground border-primary"
							: "bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted"
					)}
					aria-pressed={value === type}
				>
					<Icon className="h-3 w-3" />
					{label}
				</button>
			))}
		</div>
	)
}
