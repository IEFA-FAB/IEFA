import { createFileRoute } from "@tanstack/react-router"
import { LayoutGrid, X } from "lucide-react"
import { HubLayout } from "#/components/hub-layout"
import { ToolCard } from "#/components/tool-card"
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
					<button
						type="button"
						onClick={clear}
						className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-card border border-border px-3 py-1.5 rounded-full hover:text-foreground hover:border-border transition-colors"
					>
						{query.trim() !== "" ? `Busca "${query.trim()}"` : "Filtro ativo"} <X className="w-3 h-3" />
					</button>
				)}
				<span className="text-[10px] font-mono text-muted-foreground">
					{filtered.length} de {sucontTools.length}
				</span>
				<div className="flex-grow h-[1px] bg-border" />
			</div>

			{filtered.length === 0 ? (
				<div className="flex flex-col items-center gap-4 py-16">
					<p className="text-muted-foreground text-sm font-mono">Nenhuma ferramenta encontrada.</p>
					{isFiltered && (
						<button
							type="button"
							onClick={clear}
							className="text-xs font-bold uppercase tracking-widest text-tech-cyan border border-tech-cyan/30 px-4 py-2 rounded-xl hover:bg-tech-cyan/5 transition-colors"
						>
							Limpar filtros
						</button>
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
