import { Building2, ChefHat, Info, Utensils } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { RELATION_LABELS } from "@/lib/places-graph/validate"
import type { RelationType } from "@/types/domain/places"

const RELATION_COLORS: Record<RelationType, string> = {
	"kitchen.unit_id": "var(--color-chart-1)",
	"kitchen.purchase_unit_id": "var(--color-chart-4)",
	"kitchen.kitchen_id": "var(--color-chart-2)",
	"mess_halls.unit_id": "var(--color-chart-3)",
	"mess_halls.kitchen_id": "var(--color-chart-5)",
}

const RELATION_DESCRIPTIONS: Record<RelationType, string> = {
	"kitchen.unit_id": "Unidade organizacional da cozinha",
	"kitchen.purchase_unit_id": "Unidade responsável pelas compras",
	"kitchen.kitchen_id": "Cozinha de produção que abastece",
	"mess_halls.unit_id": "Unidade organizacional do refeitório",
	"mess_halls.kitchen_id": "Cozinha que opera o refeitório",
}

const NODE_ENTRIES = [
	{ icon: Building2, label: "Unidade", description: "Unidade militar organizacional", color: "var(--color-chart-1)" },
	{ icon: ChefHat, label: "Cozinha", description: "Cozinha de produção ou consumo", color: "var(--color-chart-2)" },
	{ icon: Utensils, label: "Refeitório", description: "Local de alimentação das tropas", color: "var(--color-chart-3)" },
]

const RELATION_ENTRIES = Object.entries(RELATION_LABELS) as [RelationType, string][]

export function GraphLegend() {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger
					render={
						<PopoverTrigger render={<Button variant="outline" size="sm" aria-label="Legenda do grafo" />}>
							<Info className="size-3.5" />
						</PopoverTrigger>
					}
				/>
				<TooltipContent>Legenda</TooltipContent>
			</Tooltip>

			<PopoverContent side="bottom" align="end" className="w-72 p-3">
				<p className="text-xs font-semibold text-foreground mb-2">Entidades</p>
				<div className="flex flex-col gap-1.5">
					{NODE_ENTRIES.map(({ icon: Icon, label, description, color }) => (
						<div key={label} className="flex items-center gap-2">
							<div
								className="size-5 rounded flex items-center justify-center flex-shrink-0"
								style={{ backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)` }}
							>
								<Icon className="size-3" style={{ color }} />
							</div>
							<div className="min-w-0">
								<span className="text-xs font-medium text-foreground">{label}</span>
								<span className="text-xs text-muted-foreground"> — {description}</span>
							</div>
						</div>
					))}
				</div>

				<Separator className="my-2.5" />

				<p className="text-xs font-semibold text-foreground mb-2">Relações</p>
				<div className="flex flex-col gap-1.5">
					{RELATION_ENTRIES.map(([relationType, label]) => (
						<div key={relationType} className="flex items-center gap-2">
							<div className="w-5 h-0.5 flex-shrink-0" style={{ backgroundColor: RELATION_COLORS[relationType] }} />
							<div className="min-w-0">
								<span className="text-xs font-medium text-foreground">{label}</span>
								<p className="text-[10px] text-muted-foreground leading-tight">{RELATION_DESCRIPTIONS[relationType]}</p>
							</div>
						</div>
					))}
				</div>

				<Separator className="my-2.5" />

				<div className="flex items-center gap-2">
					<div
						className="w-5 h-0.5 flex-shrink-0"
						style={{
							backgroundImage: `repeating-linear-gradient(90deg, var(--color-warning) 0, var(--color-warning) 5px, transparent 5px, transparent 8px)`,
						}}
					/>
					<span className="text-[10px] text-muted-foreground">Relação alterada (aguardando salvar)</span>
				</div>
			</PopoverContent>
		</Popover>
	)
}
