// Extraído de routes/monitoramento.tsx (port do Analistasaldoimproprio): filtros por questão do RAC e conferente.
import { Trash2 } from "lucide-react"
import { Button } from "#/components/ui/button"
import { Combobox, type ComboboxOption } from "#/components/ui/combobox"
import { Label } from "#/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import type { ProcessedRow } from "#/lib/analista/types"
import { getConferente } from "#/lib/ug/registry"

interface MonitoramentoFiltersProps {
	data: ProcessedRow[]
	racFilterItems: ComboboxOption[]
	activeRacFilter: string
	setActiveRacFilter: (value: string) => void
	activeConferenteFilter: string
	setActiveConferenteFilter: (value: string) => void
}

export function MonitoramentoFilters({
	data,
	racFilterItems,
	activeRacFilter,
	setActiveRacFilter,
	activeConferenteFilter,
	setActiveConferenteFilter,
}: MonitoramentoFiltersProps) {
	return (
		<div className="flex flex-wrap items-end gap-6">
			<div className="flex flex-col gap-2">
				<Label htmlFor="rac-filter">Questão do RAC</Label>
				<Combobox
					id="rac-filter"
					value={activeRacFilter}
					onValueChange={setActiveRacFilter}
					items={racFilterItems}
					className="w-56"
					aria-label="Questão do RAC"
				/>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="conferente-filter">Conferente</Label>
				<Select items={{ TODOS: "Todos os conferentes" }} value={activeConferenteFilter} onValueChange={(v) => setActiveConferenteFilter(v ?? "TODOS")}>
					<SelectTrigger id="conferente-filter" className="w-56">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="TODOS">Todos os conferentes</SelectItem>
						{Array.from(new Set(data.map((r) => getConferente(r.ug))))
							.sort()
							.map((conf) => (
								<SelectItem key={conf} value={conf}>
									{conf}
								</SelectItem>
							))}
					</SelectContent>
				</Select>
			</div>
			{(activeRacFilter !== "TODOS" || activeConferenteFilter !== "TODOS") && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => {
						setActiveRacFilter("TODOS")
						setActiveConferenteFilter("TODOS")
					}}
				>
					<Trash2 />
					Limpar filtros
				</Button>
			)}
		</div>
	)
}
