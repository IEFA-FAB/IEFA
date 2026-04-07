import { createFileRoute, Link } from "@tanstack/react-router"
import { Calendar, Filter, OpenBook, Page, Search, User } from "iconoir-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

export const Route = createFileRoute("/journal/articles/")({
	staticData: {
		nav: {
			title: "Artigos publicados",
			section: "Revista",
			subtitle: "Catálogo dos artigos científicos publicados",
			keywords: ["artigos", "publicados", "periodico", "pesquisa"],
			order: 70,
		},
	},
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

const ARTICLE_TYPE_LABELS: Record<string, string> = {
	research: "Pesquisa",
	review: "Revisão",
	short_communication: "Comunicação Curta",
	editorial: "Editorial",
}

function PublishedArticles() {
	const [searchQuery, setSearchQuery] = useState("")
	const [selectedType, setSelectedType] = useState<string>("all")
	const [selectedYear, setSelectedYear] = useState<string>("all")
	const [showFilters, setShowFilters] = useState(false)

	// Placeholder - will be replaced with real data from publishedArticlesQueryOptions
	const articles: Article[] = []
	const isLoading = false

	const hasFilters = !!searchQuery || selectedType !== "all" || selectedYear !== "all"

	const clearFilters = () => {
		setSearchQuery("")
		setSelectedType("all")
		setSelectedYear("all")
	}

	return (
		<div className="relative flex flex-col w-full text-foreground">
			{/* ─── Cabeçalho ──────────────────────────────────────────────────────── */}
			<section aria-label="Cabeçalho" className="mb-8">
				<p className="text-label text-muted-foreground mb-3">Periódico · Artigos</p>
				<h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">Artigos Publicados</h1>
				<p className="text-muted-foreground text-sm text-pretty">Navegue pelos artigos científicos publicados no periódico do IEFA.</p>
			</section>

			<Separator className="mb-8" />

			{/* ─── Busca e Filtros ─────────────────────────────────────────────────── */}
			<div className="mb-8">
				<div className="flex flex-col sm:flex-row gap-3">
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
						<Input
							placeholder="Buscar por título, autor ou palavras-chave..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-9"
							aria-label="Buscar artigos"
						/>
					</div>
					<Button
						variant={showFilters ? "default" : "outline"}
						onClick={() => setShowFilters(!showFilters)}
						aria-expanded={showFilters}
						aria-controls="filter-panel"
					>
						<Filter className="size-4 mr-2" aria-hidden="true" />
						Filtros
						{hasFilters && <span className="ml-1.5 size-1.5 bg-current rounded-full" aria-hidden="true" />}
					</Button>
				</div>

				{showFilters && (
					<div id="filter-panel" className="mt-3 p-5 border border-border bg-card">
						<div className="grid sm:grid-cols-3 gap-5">
							<div className="space-y-2">
								<label className="text-label text-muted-foreground" htmlFor="article-type-select">
									Tipo de Artigo
								</label>
								<Select value={selectedType} onValueChange={(v) => setSelectedType(v ?? "all")}>
									<SelectTrigger className="w-full" id="article-type-select">
										<SelectValue placeholder="Todos" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">Todos</SelectItem>
										<SelectItem value="research">Pesquisa</SelectItem>
										<SelectItem value="review">Revisão</SelectItem>
										<SelectItem value="short_communication">Comunicação Curta</SelectItem>
										<SelectItem value="editorial">Editorial</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<label className="text-label text-muted-foreground" htmlFor="year-select">
									Ano
								</label>
								<Select value={selectedYear} onValueChange={(v) => setSelectedYear(v ?? "all")}>
									<SelectTrigger className="w-full" id="year-select">
										<SelectValue placeholder="Todos" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">Todos</SelectItem>
										<SelectItem value="2025">2025</SelectItem>
										<SelectItem value="2024">2024</SelectItem>
										<SelectItem value="2023">2023</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="flex items-end">
								<Button variant="outline" onClick={clearFilters} disabled={!hasFilters} className="w-full">
									Limpar Filtros
								</Button>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* ─── Resultados ──────────────────────────────────────────────────────── */}
			{isLoading ? (
				<div className="grid md:grid-cols-2 gap-5">
					{[1, 2, 3, 4].map((i) => (
						<Skeleton key={i} className="h-48 rounded-none" />
					))}
				</div>
			) : articles.length > 0 ? (
				<div className="grid md:grid-cols-2 gap-5">
					{articles.map((article) => (
						<Link key={article.id} to="/journal/articles/$id" params={{ id: article.id }} className="group">
							<ArticleCard article={article} />
						</Link>
					))}
				</div>
			) : (
				<EmptyState hasFilters={hasFilters} onClear={clearFilters} />
			)}
		</div>
	)
}

interface ArticleCardProps {
	article: Article
}

function ArticleCard({ article }: ArticleCardProps) {
	return (
		<div className="p-6 border border-border hover:bg-accent hover:border-foreground/20 transition-colors bg-card h-full flex flex-col gap-3 cursor-pointer">
			{/* Tipo + DOI */}
			<div className="flex items-center justify-between gap-2 flex-wrap">
				<Badge variant="secondary" className="uppercase tracking-[0.06em]">
					{ARTICLE_TYPE_LABELS[article.article_type] ?? article.article_type}
				</Badge>
				{article.doi && <span className="text-xs text-muted-foreground font-mono truncate">DOI: {article.doi}</span>}
			</div>

			{/* Título */}
			<h3 className="font-semibold text-base leading-snug line-clamp-2">{article.title_pt}</h3>

			{/* Autores */}
			<div className="flex items-center gap-2 text-sm text-muted-foreground mt-auto">
				<User className="size-3.5 shrink-0" aria-hidden="true" />
				<span className="line-clamp-1">{article.authors.map((a) => a.full_name).join(", ")}</span>
			</div>

			{/* Data */}
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Calendar className="size-3.5 shrink-0" aria-hidden="true" />
				<span>{new Date(article.published_at).toLocaleDateString("pt-BR")}</span>
			</div>
		</div>
	)
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center py-20 px-4 text-center border border-dashed border-border">
			<div className="size-14 border border-border bg-muted flex items-center justify-center mb-5" aria-hidden="true">
				<OpenBook className="size-6 text-muted-foreground" />
			</div>
			<h3 className="font-semibold text-base mb-2">{hasFilters ? "Nenhum artigo encontrado" : "Nenhum artigo publicado ainda"}</h3>
			<p className="text-sm text-muted-foreground max-w-sm mb-6 text-pretty">
				{hasFilters
					? "Tente ajustar os filtros ou fazer uma nova busca."
					: "Os artigos publicados aparecerão aqui após serem aceitos e publicados pelo editor."}
			</p>
			{hasFilters && (
				<Button variant="outline" onClick={onClear}>
					<Page className="size-4 mr-2" aria-hidden="true" />
					Ver todos os artigos
				</Button>
			)}
		</div>
	)
}
