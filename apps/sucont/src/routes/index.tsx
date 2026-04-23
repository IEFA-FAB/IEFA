import { createFileRoute } from "@tanstack/react-router"
import { LayoutGrid } from "lucide-react"
import { HubLayout } from "#/components/hub-layout"
import { ToolCard } from "#/components/tool-card"
import { sucontTools } from "#/lib/data"
import { useActiveCategory, useSearchQuery } from "#/lib/hub-store"

export const Route = createFileRoute("/")({ component: Dashboard })

function Dashboard() {
	const searchQuery = useSearchQuery()
	const activeCategory = useActiveCategory()

	const filtered = (
		activeCategory === "Visão Geral" ? sucontTools : sucontTools.filter((t) => t.category.includes(activeCategory) || activeCategory.includes(t.category))
	).filter(
		(t) =>
			t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
			t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
			t.category.toLowerCase().includes(searchQuery.toLowerCase())
	)

	return (
		<HubLayout>
			<div className="flex items-center gap-4 mb-8">
				<LayoutGrid className="text-tech-cyan w-5 h-5" />
				<h2 className="text-slate-700 font-bold uppercase tracking-widest text-sm">{activeCategory}</h2>
				<div className="flex-grow h-[1px] bg-slate-200" />
			</div>

			{filtered.length === 0 ? (
				<p className="text-slate-400 text-sm font-mono text-center py-16">Nenhuma ferramenta encontrada.</p>
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
