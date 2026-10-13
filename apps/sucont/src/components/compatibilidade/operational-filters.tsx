/**
 * Filtros da aba operacional (questão do RAC e conferente). Extraído de
 * routes/analista-compatibilidade.tsx (port do analistacompatibilidade); o
 * estado dos filtros continua na rota.
 */
import { Combobox } from "#/components/ui/combobox"
import { Label } from "#/components/ui/label"
import { SegmentedControl } from "#/components/ui/segmented-control"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"

interface OperationalFiltersProps {
	racFilter: string
	onRacFilterChange: (value: string) => void
	racFilterItems: { value: string; label: string }[]
	conferenteFilter: string
	onConferenteFilterChange: (value: string) => void
	userProfile: string | null
	conferentesList: string[]
}

export function OperationalFilters({
	racFilter,
	onRacFilterChange,
	racFilterItems,
	conferenteFilter,
	onConferenteFilterChange,
	userProfile,
	conferentesList,
}: OperationalFiltersProps) {
	return (
		<div className="flex flex-wrap items-end gap-6">
			<div className="flex flex-col gap-2">
				<Label htmlFor="rac-filter">Questão do RAC</Label>
				<Combobox id="rac-filter" value={racFilter} onValueChange={onRacFilterChange} items={racFilterItems} className="w-56" aria-label="Questão do RAC" />
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="conferente-filter-select">Conferente</Label>
				<div className="flex items-center gap-2">
					<SegmentedControl
						label="Conferente"
						value={conferenteFilter === "all" || conferenteFilter === "minhas" ? conferenteFilter : "outro"}
						onValueChange={(value) => {
							if (value !== "outro") onConferenteFilterChange(value)
						}}
						options={[
							{ value: "all", label: "Geral" },
							...(userProfile ? [{ value: "minhas", label: "Minhas UGs" }] : []),
							...(conferenteFilter !== "all" && conferenteFilter !== "minhas" ? [{ value: "outro", label: conferenteFilter }] : []),
						]}
					/>
					<Select
						value={conferenteFilter !== "all" && conferenteFilter !== "minhas" ? conferenteFilter : null}
						onValueChange={(v) => onConferenteFilterChange(v ?? "all")}
					>
						<SelectTrigger id="conferente-filter-select" className="w-44">
							<SelectValue placeholder="Escolher conferente" />
						</SelectTrigger>
						<SelectContent>
							{conferentesList.map((c) => (
								<SelectItem key={c} value={c}>
									{c}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>
	)
}
