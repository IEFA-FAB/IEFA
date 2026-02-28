import { Button, Input } from "@iefa/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { BookOpen, Calendar, FileText, Filter, Search, User } from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/journal/articles/")({
	component: PublishedArticles,
})

interface Article {
	id: string
	submission_number: string
	title_pt: string
	title_en: string
	authors: { full_name: string }[]
	published_at: string
	article_type: string
	doi?: string
}

function PublishedArticles() {
	const [searchQuery, setSearchQuery] = useState("")
	const [selectedType, setSelectedType] = useState<string>("all")
	const [selectedYear, setSelectedYear] = useState<string>("all")
	const [showFilters, setShowFilters] = useState(false)

	// Placeholder - will be replaced with real data from publishedArticlesQueryOptions
	const articles: Article[] = []
	const isLoading = false

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="space-y-4">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Artigos Publicados</h1>
					<p className="text-muted-foreground">
						Navegue pelos artigos científicos publicados no periódico
					</p>
				</div>

				{/* Search and Filters */}
				<div className="flex flex-col sm:flex-row gap-3">
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
						<Input
							placeholder="Buscar por título, autor ou palavras-chave..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-9"
						/>
					</div>
					<Button
						variant={showFilters ? "default" : "outline"}
						onClick={() => setShowFilters(!showFilters)}
					>
						<Filter className="size-4 mr-2" />
						Filtros
					</Button>
				</div>

				{/* Filter Panel */}
				{showFilters && (
					<div className="p-4 border rounded-lg bg-card space-y-4">
						<div className="grid sm:grid-cols-3 gap-4">
							{/* Article Type Filter */}
							<div className="space-y-2">
								<label className="text-sm font-medium" htmlFor="article-type">
									Tipo de Artigo
								</label>
								<select
									id="article-type"
									value={selectedType}
									onChange={(e) => setSelectedType(e.target.value)}
									className="w-full px-3 py-2 border rounded-md bg-background"
								>
									<option value="all">Todos</option>
									<option value="research">Pesquisa</option>
									<option value="review">Revisão</option>
									<option value="short_communication">Comunicação Curta</option>
									<option value="editorial">Editorial</option>
								</select>
							</div>

							{/* Year Filter */}
							<div className="space-y-2">
								<label className="text-sm font-medium" htmlFor="article-year">
									Ano
								</label>
								<select
									id="article-year"
									value={selectedYear}
									onChange={(e) => setSelectedYear(e.target.value)}
									className="w-full px-3 py-2 border rounded-md bg-background"
								>
									<option value="all">Todos</option>
									<option value="2025">2025</option>
									<option value="2024">2024</option>
									<option value="2023">2023</option>
								</select>
							</div>

							{/* Clear Filters */}
							<div className="flex items-end">
								<Button
									variant="outline"
									onClick={() => {
										setSearchQuery("")
										setSelectedType("all")
										setSelectedYear("all")
									}}
									className="w-full"
								>
									Limpar Filtros
								</Button>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Results */}
			{isLoading ? (
				<div className="grid md:grid-cols-2 gap-6">
					{[1, 2, 3, 4].map((i) => (
						<div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />
					))}
				</div>
			) : articles.length > 0 ? (
				<div className="grid md:grid-cols-2 gap-6">
					{articles.map((article) => (
						<Link key={article.id} to="/journal/articles/$id" params={{ id: article.id }}>
							<ArticleCard article={article} />
						</Link>
					))}
				</div>
			) : (
				<EmptyState
					hasFilters={!!searchQuery || selectedType !== "all" || selectedYear !== "all"}
				/>
			)}
		</div>
	)
}

interface ArticleCardProps {
	article: Article
}

function ArticleCard({ article }: ArticleCardProps) {
	return (
		<div className="group p-6 border rounded-lg hover:border-primary transition-colors bg-card cursor-pointer h-full">
			<div className="space-y-3">
				{/* Type Badge */}
				<div className="flex items-center justify-between">
					<span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-medium capitalize">
						{article.article_type === "research" ? "Pesquisa" : article.article_type}
					</span>
					{article.doi && (
						<span className="text-xs text-muted-foreground font-mono">DOI: {article.doi}</span>
					)}
				</div>

				{/* Title */}
				<h3 className="font-semibold text-lg line-clamp-2 group-hover:text-primary transition-colors">
					{article.title_pt}
				</h3>

				{/* Authors */}
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<User className="size-4" />
					<span className="line-clamp-1">{article.authors.map((a) => a.full_name).join(", ")}</span>
				</div>

				{/* Date */}
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Calendar className="size-4" />
					<span>{new Date(article.published_at).toLocaleDateString("pt-BR")}</span>
				</div>
			</div>
		</div>
	)
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
	return (
		<div className="flex flex-col items-center justify-center py-16 px-4 text-center">
			<div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
				<BookOpen className="size-8 text-muted-foreground" />
			</div>
			<h3 className="text-lg font-semibold mb-2">
				{hasFilters ? "Nenhum artigo encontrado" : "Nenhum artigo publicado ainda"}
			</h3>
			<p className="text-muted-foreground max-w-md mb-6">
				{hasFilters
					? "Tente ajustar os filtros ou fazer uma nova busca."
					: "Os artigos publicados aparecerão aqui após serem aceitos e publicados pelo editor."}
			</p>
			{hasFilters && (
				<Button variant="outline" onClick={() => window.location.reload()}>
					<FileText className="size-4 mr-2" />
					Ver todos os artigos
				</Button>
			)}
		</div>
	)
}
