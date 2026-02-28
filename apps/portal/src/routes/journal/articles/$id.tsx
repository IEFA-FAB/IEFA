import { Button } from "@iefa/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
	ArrowLeft,
	Calendar,
	Check,
	Copy,
	Download,
	ExternalLink,
	FileText,
	Tag,
	User,
} from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/journal/articles/$id")({
	component: PublicArticleDetail,
})

interface ArticleAuthor {
	full_name: string
	orcid?: string
}

interface ArticleDetail {
	title_pt: string
	title_en?: string
	authors: ArticleAuthor[]
	published_at: string
	article_type: string
	doi?: string
	volume?: number
	issue?: number
	page_start?: number
	page_end?: number
	abstract_pt: string
	abstract_en?: string
	keywords_pt: string[]
	keywords_en?: string[]
	subject_area: string
	funding_info?: string
}

function PublicArticleDetail() {
	const { id } = Route.useParams()
	const [copiedCitation, setCopiedCitation] = useState<string | null>(null)

	// Simulated data fetching based on ID
	// In a real implementation, this would be: const { data: article } = useSuspenseQuery(publishedArticleQueryOptions(id))
	const article: ArticleDetail | null = {
		title_pt: `Artigo Exemplo ${id}`,
		title_en: `Example Article ${id}`,
		authors: [
			{ full_name: "Dr. João Silva", orcid: "0000-0000-0000-0000" },
			{ full_name: "Dra. Maria Santos" },
		],
		published_at: new Date().toISOString(),
		article_type: "research",
		doi: `10.1234/iefa.${id}`,
		volume: 5,
		issue: 2,
		page_start: 10,
		page_end: 25,
		abstract_pt: "Este é um resumo simulado do artigo para fins de visualização.",
		abstract_en: "This is a simulated abstract of the article for visualization purposes.",
		keywords_pt: ["Educação", "Tecnologia", "Inovação"],
		keywords_en: ["Education", "Technology", "Innovation"],
		subject_area: "Ciências Humanas",
		funding_info: "CNPq - Processo 123456/2025-0",
	}

	const isLoading = false

	const copyCitation = (format: string, text: string) => {
		navigator.clipboard.writeText(text)
		setCopiedCitation(format)
		setTimeout(() => setCopiedCitation(null), 2000)
	}

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="h-12 w-48 animate-pulse bg-muted rounded" />
				<div className="h-64 animate-pulse bg-muted rounded" />
			</div>
		)
	}

	if (!article) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-center">
				<div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
					<FileText className="size-8 text-muted-foreground" />
				</div>
				<h3 className="text-lg font-semibold mb-2">Artigo não encontrado ou ainda não publicado</h3>
				<p className="text-muted-foreground mb-6">
					Este artigo pode ainda estar em processo de revisão ou não existe.
				</p>
				<Button
					render={
						<Link to="/journal/articles">
							<ArrowLeft className="size-4 mr-2" />
							Voltar à listagem
						</Link>
					}
					variant="outline"
				/>
			</div>
		)
	}

	// Generate citation formats (these would use real data)
	const citations = {
		apa: `Autor, A. A. (2025). Título do artigo. Nome da Revista, 1(1), 1-10. https://doi.org/10.xxxx/xxxxx`,
		abnt: `AUTOR, A. A. Título do artigo. Nome da Revista, v. 1, n. 1, p. 1-10, 2025.`,
		bibtex: `@article{autor2025,
  author = {Autor, A. A.},
  title = {Título do artigo},
  journal = {Nome da Revista},
  volume = {1},
  number = {1},
  pages = {1--10},
  year = {2025},
  doi = {10.xxxx/xxxxx}
}`,
	}

	return (
		<div className="space-y-8">
			{/* Header */}
			<div className="flex items-center gap-4">
				<Button
					render={
						<Link to="/journal/articles">
							<ArrowLeft className="size-4 mr-2" />
							Voltar
						</Link>
					}
					variant="outline"
					size="sm"
				/>
			</div>

			{/* Article Content */}
			<div className="grid lg:grid-cols-[1fr_300px] gap-8">
				{/* Main Content */}
				<div className="space-y-6">
					{/* Metadata Section */}
					<div className="space-y-4">
						<div className="flex items-center gap-2">
							<span className="px-2.5 py-1 bg-primary/10 text-primary rounded text-xs font-medium capitalize">
								{article.article_type}
							</span>
							{article.doi && (
								<a
									href={`https://doi.org/${article.doi}`}
									target="_blank"
									rel="noopener noreferrer"
									className="px-2.5 py-1 bg-muted hover:bg-muted/80 rounded text-xs font-mono inline-flex items-center gap-1"
								>
									DOI: {article.doi}
									<ExternalLink className="size-3" />
								</a>
							)}
						</div>

						<h1 className="text-4xl font-bold tracking-tight">{article.title_pt}</h1>

						{article.title_en && (
							<h2 className="text-2xl text-muted-foreground">{article.title_en}</h2>
						)}

						{/* Authors */}
						<div className="flex items-center gap-2 text-lg">
							<User className="size-5 text-muted-foreground" />
							<div className="flex flex-wrap gap-2">
								{article.authors.map((author, i) => (
									<span key={i}>
										{author.full_name}
										{author.orcid && (
											<a
												href={`https://orcid.org/${author.orcid}`}
												target="_blank"
												rel="noopener noreferrer"
												className="ml-1 text-primary hover:underline"
											>
												<ExternalLink className="inline size-3" />
											</a>
										)}
										{i < article.authors.length - 1 && ", "}
									</span>
								))}
							</div>
						</div>

						{/* Publication Info */}
						<div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
							<div className="flex items-center gap-2">
								<Calendar className="size-4" />
								Publicado em {new Date(article.published_at).toLocaleDateString("pt-BR")}
							</div>
							{article.volume && (
								<span>
									Vol. {article.volume}, Nº {article.issue}
								</span>
							)}
							{article.page_start && (
								<span>
									p. {article.page_start}-{article.page_end}
								</span>
							)}
						</div>
					</div>

					{/* Abstract */}
					<div className="space-y-3 p-6 border rounded-lg bg-card">
						<h3 className="font-semibold text-lg">Resumo</h3>
						<p className="text-muted-foreground leading-relaxed">{article.abstract_pt}</p>
					</div>

					{article.abstract_en && (
						<div className="space-y-3 p-6 border rounded-lg bg-card">
							<h3 className="font-semibold text-lg">Abstract</h3>
							<p className="text-muted-foreground leading-relaxed">{article.abstract_en}</p>
						</div>
					)}

					{/* Keywords */}
					<div className="space-y-3">
						<h3 className="font-semibold flex items-center gap-2">
							<Tag className="size-4" />
							Palavras-chave
						</h3>
						<div className="flex flex-wrap gap-2">
							{article.keywords_pt?.map((keyword: string) => (
								<span key={keyword} className="px-3 py-1 bg-muted rounded-full text-sm">
									{keyword}
								</span>
							))}
						</div>
					</div>

					{article.keywords_en && (
						<div className="space-y-3">
							<h3 className="font-semibold flex items-center gap-2">
								<Tag className="size-4" />
								Keywords
							</h3>
							<div className="flex flex-wrap gap-2">
								{article.keywords_en.map((keyword: string) => (
									<span key={keyword} className="px-3 py-1 bg-muted rounded-full text-sm">
										{keyword}
									</span>
								))}
							</div>
						</div>
					)}

					{/* Citation Section */}
					<div className="space-y-4 p-6 border rounded-lg bg-card">
						<h3 className="font-semibold text-lg">Como Citar</h3>

						{/* APA */}
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium">APA</span>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => copyCitation("apa", citations.apa)}
								>
									{copiedCitation === "apa" ? (
										<Check className="size-4 text-green-600" />
									) : (
										<Copy className="size-4" />
									)}
								</Button>
							</div>
							<p className="text-sm text-muted-foreground p-3 bg-muted rounded font-mono">
								{citations.apa}
							</p>
						</div>

						{/* ABNT */}
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium">ABNT</span>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => copyCitation("abnt", citations.abnt)}
								>
									{copiedCitation === "abnt" ? (
										<Check className="size-4 text-green-600" />
									) : (
										<Copy className="size-4" />
									)}
								</Button>
							</div>
							<p className="text-sm text-muted-foreground p-3 bg-muted rounded font-mono">
								{citations.abnt}
							</p>
						</div>

						{/* BibTeX */}
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium">BibTeX</span>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => copyCitation("bibtex", citations.bibtex)}
								>
									{copiedCitation === "bibtex" ? (
										<Check className="size-4 text-green-600" />
									) : (
										<Copy className="size-4" />
									)}
								</Button>
							</div>
							<pre className="text-xs text-muted-foreground p-3 bg-muted rounded overflow-x-auto">
								{citations.bibtex}
							</pre>
						</div>
					</div>
				</div>

				{/* Sidebar */}
				<div className="space-y-6">
					{/* Download */}
					<div className="p-4 border rounded-lg bg-card space-y-3">
						<h3 className="font-semibold">Arquivos</h3>
						<Button className="w-full" disabled>
							<Download className="size-4 mr-2" />
							Download PDF
						</Button>
						<p className="text-xs text-muted-foreground text-center">
							Arquivo disponível após publicação
						</p>
					</div>

					{/* Metrics Placeholder */}
					<div className="p-4 border rounded-lg bg-card space-y-3">
						<h3 className="font-semibold">Métricas</h3>
						<div className="space-y-2 text-sm">
							<div className="flex justify-between">
								<span className="text-muted-foreground">Visualizações:</span>
								<span className="font-semibold">-</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Downloads:</span>
								<span className="font-semibold">-</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Citações:</span>
								<span className="font-semibold">-</span>
							</div>
						</div>
					</div>

					{/* Info */}
					<div className="p-4 border rounded-lg bg-card space-y-3">
						<h3 className="font-semibold">Informações</h3>
						<div className="space-y-2 text-sm">
							<div>
								<p className="text-muted-foreground">Área do Conhecimento</p>
								<p className="font-medium">{article.subject_area}</p>
							</div>
							{article.funding_info && (
								<div>
									<p className="text-muted-foreground">Financiamento</p>
									<p className="font-medium text-xs">{article.funding_info}</p>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
