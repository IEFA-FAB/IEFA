import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, Calendar, Check, Copy, Download, Hashtag, OpenNewWindow, Page, User } from "iconoir-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

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

const ARTICLE_TYPE_LABELS: Record<string, string> = {
	research: "Pesquisa",
	review: "Revisão",
	short_communication: "Comunicação Curta",
	editorial: "Editorial",
}

function PublicArticleDetail() {
	const { id } = Route.useParams()
	const [copiedCitation, setCopiedCitation] = useState<string | null>(null)

	// Simulated data fetching based on ID
	// In a real implementation, this would be: const { data: article } = useSuspenseQuery(publishedArticleQueryOptions(id))
	const article: ArticleDetail | null = {
		title_pt: `Artigo Exemplo ${id}`,
		title_en: `Example Article ${id}`,
		authors: [{ full_name: "Dr. João Silva", orcid: "0000-0000-0000-0000" }, { full_name: "Dra. Maria Santos" }],
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
				<Skeleton className="h-8 w-32 rounded-none" />
				<Skeleton className="h-64 rounded-none" />
			</div>
		)
	}

	if (!article) {
		return (
			<div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border">
				<div className="size-14 border border-border bg-muted flex items-center justify-center mb-5" aria-hidden="true">
					<Page className="size-6 text-muted-foreground" />
				</div>
				<h3 className="font-semibold text-base mb-2">Artigo não encontrado ou ainda não publicado</h3>
				<p className="text-sm text-muted-foreground mb-6 max-w-sm text-pretty">Este artigo pode ainda estar em processo de revisão ou não existe.</p>
				<Button
					nativeButton={false}
					render={
						<Link to="/journal/articles">
							<ArrowLeft className="size-4 mr-2" aria-hidden="true" />
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
		<div className="relative flex flex-col w-full text-foreground">
			{/* ─── Navegação de volta ──────────────────────────────────────────────── */}
			<div className="mb-8">
				<Button
					nativeButton={false}
					render={
						<Link to="/journal/articles">
							<ArrowLeft className="size-4 mr-2" aria-hidden="true" />
							Artigos Publicados
						</Link>
					}
					variant="outline"
					size="sm"
				/>
			</div>

			{/* ─── Conteúdo do artigo ──────────────────────────────────────────────── */}
			<div className="grid lg:grid-cols-[1fr_280px] gap-10">
				{/* Coluna principal */}
				<div className="space-y-8 min-w-0">
					{/* Metadados de topo */}
					<div className="space-y-4">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="secondary" className="uppercase tracking-[0.06em]">
								{ARTICLE_TYPE_LABELS[article.article_type] ?? article.article_type}
							</Badge>
							{article.doi && (
								<a
									href={`https://doi.org/${article.doi}`}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1 px-2 py-0.5 border border-border bg-muted hover:bg-accent text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
								>
									DOI: {article.doi}
									<OpenNewWindow className="size-3" aria-hidden="true" />
								</a>
							)}
						</div>

						{/* Título em Lora — editorial */}
						<h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight leading-tight">{article.title_pt}</h1>

						{article.title_en && <p className="font-serif text-xl text-muted-foreground italic leading-snug">{article.title_en}</p>}

						{/* Autores */}
						<div className="flex items-start gap-2 text-base">
							<User className="size-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
							<div className="flex flex-wrap gap-x-1">
								{article.authors.map((author, i) => (
									<span key={i}>
										{author.full_name}
										{author.orcid && (
											<a
												href={`https://orcid.org/${author.orcid}`}
												target="_blank"
												rel="noopener noreferrer"
												className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
												aria-label={`ORCID de ${author.full_name}`}
											>
												<OpenNewWindow className="inline size-3" aria-hidden="true" />
											</a>
										)}
										{i < article.authors.length - 1 && <span className="text-muted-foreground">,&nbsp;</span>}
									</span>
								))}
							</div>
						</div>

						{/* Informações de publicação */}
						<div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
							<div className="flex items-center gap-1.5">
								<Calendar className="size-3.5" aria-hidden="true" />
								Publicado em {new Date(article.published_at).toLocaleDateString("pt-BR")}
							</div>
							{article.volume && (
								<span>
									Vol. {article.volume}, Nº {article.issue}
								</span>
							)}
							{article.page_start && (
								<span>
									p. {article.page_start}–{article.page_end}
								</span>
							)}
						</div>
					</div>

					<Separator />

					{/* Resumo */}
					<div className="p-6 border border-border bg-card space-y-3">
						<h2 className="font-semibold text-sm uppercase tracking-[0.06em] text-muted-foreground">Resumo</h2>
						<p className="font-serif text-base text-foreground leading-relaxed">{article.abstract_pt}</p>
					</div>

					{article.abstract_en && (
						<div className="p-6 border border-border bg-card space-y-3">
							<h2 className="font-semibold text-sm uppercase tracking-[0.06em] text-muted-foreground">Abstract</h2>
							<p className="font-serif text-base text-foreground leading-relaxed italic">{article.abstract_en}</p>
						</div>
					)}

					{/* Palavras-chave */}
					<div className="space-y-3">
						<h2 className="font-semibold text-sm uppercase tracking-[0.06em] text-muted-foreground flex items-center gap-1.5">
							<Hashtag className="size-3.5" aria-hidden="true" />
							Palavras-chave
						</h2>
						<div className="flex flex-wrap gap-2">
							{article.keywords_pt?.map((keyword: string) => (
								<Badge key={keyword} variant="outline" className="uppercase tracking-[0.04em]">
									{keyword}
								</Badge>
							))}
						</div>
					</div>

					{article.keywords_en && (
						<div className="space-y-3">
							<h2 className="font-semibold text-sm uppercase tracking-[0.06em] text-muted-foreground flex items-center gap-1.5">
								<Hashtag className="size-3.5" aria-hidden="true" />
								Keywords
							</h2>
							<div className="flex flex-wrap gap-2">
								{article.keywords_en.map((keyword: string) => (
									<Badge key={keyword} variant="outline" className="uppercase tracking-[0.04em] italic">
										{keyword}
									</Badge>
								))}
							</div>
						</div>
					)}

					<Separator />

					{/* Como Citar */}
					<div className="space-y-4">
						<h2 className="font-semibold text-sm uppercase tracking-[0.06em] text-muted-foreground">Como Citar</h2>

						{(["apa", "abnt", "bibtex"] as const).map((format) => (
							<div key={format} className="border border-border bg-card">
								<div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
									<span className="text-label text-muted-foreground">{format.toUpperCase()}</span>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => copyCitation(format, citations[format])}
										aria-label={`Copiar citação ${format.toUpperCase()}`}
									>
										{copiedCitation === format ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
									</Button>
								</div>
								{format === "bibtex" ? (
									<pre className="p-4 text-xs text-muted-foreground font-mono overflow-x-auto whitespace-pre leading-relaxed">{citations[format]}</pre>
								) : (
									<p className="p-4 text-sm text-muted-foreground font-mono leading-relaxed">{citations[format]}</p>
								)}
							</div>
						))}
					</div>
				</div>

				{/* ─── Barra lateral ─────────────────────────────────────────────── */}
				<aside className="space-y-4" aria-label="Informações do artigo">
					{/* Download */}
					<div className="p-5 border border-border bg-card space-y-3">
						<h3 className="font-semibold text-sm uppercase tracking-[0.06em] text-muted-foreground">Arquivos</h3>
						<Button className="w-full" disabled>
							<Download className="size-4 mr-2" aria-hidden="true" />
							Download PDF
						</Button>
						<p className="text-xs text-muted-foreground text-center">Arquivo disponível após publicação</p>
					</div>

					{/* Métricas */}
					<div className="p-5 border border-border bg-card">
						<h3 className="font-semibold text-sm uppercase tracking-[0.06em] text-muted-foreground mb-3">Métricas</h3>
						<div className="divide-y divide-border">
							<div className="flex justify-between py-2.5 text-sm">
								<span className="text-muted-foreground">Visualizações</span>
								<span className="font-semibold tabular-nums">—</span>
							</div>
							<div className="flex justify-between py-2.5 text-sm">
								<span className="text-muted-foreground">Downloads</span>
								<span className="font-semibold tabular-nums">—</span>
							</div>
							<div className="flex justify-between py-2.5 text-sm">
								<span className="text-muted-foreground">Citações</span>
								<span className="font-semibold tabular-nums">—</span>
							</div>
						</div>
					</div>

					{/* Informações */}
					<div className="p-5 border border-border bg-card">
						<h3 className="font-semibold text-sm uppercase tracking-[0.06em] text-muted-foreground mb-3">Informações</h3>
						<div className="divide-y divide-border">
							<div className="py-2.5">
								<p className="text-label text-muted-foreground mb-0.5">Área do Conhecimento</p>
								<p className="text-sm font-medium">{article.subject_area}</p>
							</div>
							{article.funding_info && (
								<div className="py-2.5">
									<p className="text-label text-muted-foreground mb-0.5">Financiamento</p>
									<p className="text-sm font-medium font-mono">{article.funding_info}</p>
								</div>
							)}
						</div>
					</div>
				</aside>
			</div>
		</div>
	)
}
