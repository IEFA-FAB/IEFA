import { createFileRoute } from "@tanstack/react-router"
import { LayoutGrid, X } from "lucide-react"
import { HubLayout } from "#/components/hub-layout"
import { ToolCard } from "#/components/tool-card"
import { Button } from "#/components/ui/button"
import { sucontTools } from "#/lib/data"
import { useHubFilters } from "#/lib/hub-filters"
import { filterTools } from "#/lib/tool-filter"

export const Route = createFileRoute("/")({ component: Dashboard })

function Dashboard() {
	const { query, category, isFiltered, clear } = useHubFilters()
	const filtered = filterTools(sucontTools, { query, category })

	return (
		<HubLayout searchable>
			<div className="flex flex-wrap items-center gap-4 mb-8">
				<LayoutGrid className="text-tech-cyan w-5 h-5" />
				<h2 className="text-foreground font-bold uppercase tracking-widest text-sm">{category}</h2>
				{isFiltered && (
					<Button
						variant="outline"
						size="sm"
						onClick={clear}
						className="text-label rounded-full text-muted-foreground hover:text-foreground hover:border-foreground/30"
					>
						{query.trim() !== "" ? `Busca "${query.trim()}"` : "Filtro ativo"} <X className="w-3 h-3" />
					</Button>
				)}
				<span className="text-hint font-mono text-muted-foreground">
					{filtered.length} de {sucontTools.length}
				</span>
				<div className="flex-grow h-[1px] bg-border" />
			</div>

			{filtered.length === 0 ? (
				<div className="flex flex-col items-center gap-4 py-16">
					<p className="text-muted-foreground text-sm font-mono">Nenhuma ferramenta encontrada.</p>
					{isFiltered && (
						<Button variant="outline" onClick={clear} className="text-label text-tech-cyan border-tech-cyan/30 hover:bg-tech-cyan/5">
							Limpar filtros
						</Button>
					)}
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
					{filtered.map((tool, i) => (
						<ToolCard key={tool.id} tool={tool} index={i} />
					))}
				</div>
			)}
		</HubLayout>
	)
}
