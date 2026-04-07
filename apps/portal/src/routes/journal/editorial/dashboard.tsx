import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Filter, Table2Columns, ViewGrid } from "iconoir-react"
import { useMemo, useState } from "react"
import { useCommandPaletteItems } from "@/components/command-palette/CommandPaletteProvider"
import { type DashboardFilters, FilterPanel } from "@/components/journal/editorial/FilterPanel"
import { KanbanBoard } from "@/components/journal/editorial/KanbanBoard"
import { MetricsPanel } from "@/components/journal/editorial/MetricsPanel"
import { TableView } from "@/components/journal/editorial/TableView"
import { Button } from "@/components/ui/button"
import { editorialDashboardQueryOptions } from "@/lib/journal/hooks"
import type { EditorialDashboardArticle } from "@/lib/journal/types"

type ViewMode = "kanban" | "table"

export const Route = createFileRoute("/journal/editorial/dashboard")({
	staticData: {
		nav: {
			title: "Dashboard editorial",
			section: "Editorial",
			subtitle: "Visão operacional das submissões e revisões",
			keywords: ["editorial", "dashboard", "kanban", "submissoes"],
			access: "editor",
			order: 120,
		},
	},
	loader: async ({ context }) => {
		return context.queryClient.ensureQueryData(editorialDashboardQueryOptions())
	},
	component: EditorialDashboard,
})

function EditorialDashboard() {
	const navigate = Route.useNavigate()
	const [viewMode, setViewMode] = useState<ViewMode>("kanban")
	const [showFilters, setShowFilters] = useState(false)
	const [filters, setFilters] = useState<DashboardFilters>({
		search: "",
		status: [],
		articleType: [],
		dateFrom: "",
		dateTo: "",
	})

	const { data: articles } = useSuspenseQuery(editorialDashboardQueryOptions())

	// Filter articles based on current filters
	const filteredArticles = useMemo(() => {
		return articles.filter((article: EditorialDashboardArticle) => {
			// Search filter
			if (filters.search) {
				const searchLower = filters.search.toLowerCase()
				const matchesSearch =
					article.title_pt?.toLowerCase().includes(searchLower) ||
					article.title_en?.toLowerCase().includes(searchLower) ||
					article.submission_number?.toString().includes(searchLower)
				if (!matchesSearch) return false
			}

			// Status filter
			if (filters.status.length > 0 && !filters.status.includes(article.status)) {
				return false
			}

			// Article type filter
			if (filters.articleType.length > 0 && !filters.articleType.includes(article.article_type)) {
				return false
			}

			// Date range filter
			if (filters.dateFrom && article.submitted_at) {
				if (new Date(article.submitted_at) < new Date(filters.dateFrom)) {
					return false
				}
			}
			if (filters.dateTo && article.submitted_at) {
				if (new Date(article.submitted_at) > new Date(filters.dateTo)) {
					return false
				}
			}

			return true
		})
	}, [articles, filters])
	const commandItems = useMemo(() => {
		return articles.map((article: EditorialDashboardArticle) => ({
			id: `editorial-article:${article.id}`,
			kind: "context" as const,
			title: article.title_pt || article.title_en || `Artigo ${article.submission_number}`,
			section: "Dashboard editorial",
			subtitle: `${article.submission_number} • ${article.status}`,
			keywords: [article.title_pt, article.title_en, article.submission_number?.toString(), article.status, article.article_type].filter(Boolean) as string[],
			perform: () => {
				void navigate({
					to: "/journal/editorial/articles/$articleId",
					params: { articleId: article.id },
				})
			},
		}))
	}, [articles, navigate])

	useCommandPaletteItems(commandItems)

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Dashboard Editorial</h1>
					<p className="text-muted-foreground">Gerencie submissões, revisões e publicações</p>
				</div>

				{/* View Toggle */}
				<div className="flex gap-2">
					<Button variant={showFilters ? "default" : "outline"} size="sm" onClick={() => setShowFilters(!showFilters)}>
						<Filter className="size-4 mr-2" />
						Filtros
					</Button>
					<Button variant={viewMode === "kanban" ? "default" : "outline"} size="sm" onClick={() => setViewMode("kanban")}>
						<ViewGrid className="size-4 mr-2" />
						Kanban
					</Button>
					<Button variant={viewMode === "table" ? "default" : "outline"} size="sm" onClick={() => setViewMode("table")}>
						<Table2Columns className="size-4 mr-2" />
						Tabela
					</Button>
				</div>
			</div>

			<div className="grid lg:grid-cols-[300px_1fr_300px] gap-6">
				{/* Filters Sidebar */}
				{showFilters && (
					<div>
						<FilterPanel currentFilters={filters} onFilterChange={setFilters} />
					</div>
				)}

				{/* Main Content */}
				<div className={showFilters ? "" : "lg:col-span-2"}>
					{viewMode === "kanban" ? <KanbanBoard articles={filteredArticles} /> : <TableView articles={filteredArticles} />}
					{filteredArticles.length === 0 && articles.length > 0 && (
						<div className="text-center py-12 text-muted-foreground">Nenhum artigo encontrado com os filtros aplicados.</div>
					)}
				</div>

				{/* Sidebar - Metrics */}
				<div>
					<MetricsPanel />
				</div>
			</div>
		</div>
	)
}
