import { Button, Card, CardContent, CardHeader } from "@iefa/ui"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
	ArrowLeft,
	Calendar,
	CheckCircle2,
	Clock,
	Download,
	FileText,
	MessageSquare,
	User,
	XCircle,
} from "lucide-react"
import { articleWithDetailsQueryOptions } from "@/lib/journal/hooks"

export const Route = createFileRoute("/journal/editorial/articles/$articleId")({
	loader: async ({ context, params }) => {
		return context.queryClient.ensureQueryData(articleWithDetailsQueryOptions(params.articleId))
	},
	component: ArticleDetailEditor,
})

function ArticleDetailEditor() {
	const { articleId } = Route.useParams()
	const { data: article } = useSuspenseQuery(articleWithDetailsQueryOptions(articleId))

	return (
		<div className="space-y-6">
			{/* Header with back button */}
			<div className="flex items-center gap-4">
				<Button
					render={
						<Link to="/journal/editorial/dashboard">
							<ArrowLeft className="size-4 mr-2" />
							Voltar ao Dashboard
						</Link>
					}
					variant="outline"
					size="sm"
				/>
			</div>

			{/* Article Header */}
			<div className="space-y-4">
				<div className="flex items-start justify-between">
					<div className="flex-1">
						<div className="flex items-center gap-3 mb-2">
							<span className="text-sm font-mono text-muted-foreground">
								#{article.submission_number}
							</span>
							<span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted capitalize">
								{article.status}
							</span>
						</div>
						<h1 className="text-3xl font-bold tracking-tight mb-2">{article.title_pt}</h1>
						<p className="text-lg text-muted-foreground">{article.title_en}</p>
					</div>
				</div>

				{/* Quick Actions */}
				<div className="flex gap-2 flex-wrap">
					<Button variant="default">
						<CheckCircle2 className="size-4 mr-2" />
						Aceitar
					</Button>
					<Button variant="outline">
						<MessageSquare className="size-4 mr-2" />
						Solicitar Revisão
					</Button>
					<Button variant="outline">
						<User className="size-4 mr-2" />
						Convidar Revisor
					</Button>
					<Button variant="destructive">
						<XCircle className="size-4 mr-2" />
						Rejeitar
					</Button>
				</div>
			</div>

			<div className="grid lg:grid-cols-[1fr_350px] gap-6">
				{/* Main Content */}
				<div className="space-y-6">
					{/* Metadata */}
					<Card>
						<CardHeader>
							<h2 className="font-semibold text-lg">Metadados</h2>
						</CardHeader>
						<CardContent className="space-y-4">
							<div>
								<h3 className="font-medium text-sm mb-2">Resumo (PT)</h3>
								<p className="text-sm text-muted-foreground">{article.abstract_pt}</p>
							</div>
							<div>
								<h3 className="font-medium text-sm mb-2">Abstract (EN)</h3>
								<p className="text-sm text-muted-foreground">{article.abstract_en}</p>
							</div>
							<div className="grid md:grid-cols-2 gap-4">
								<div>
									<h3 className="font-medium text-sm mb-2">Palavras-chave</h3>
									<div className="flex flex-wrap gap-2">
										{article.keywords_pt?.map((keyword: string) => (
											<span key={keyword} className="px-2 py-1 bg-muted rounded text-xs">
												{keyword}
											</span>
										))}
									</div>
								</div>
								<div>
									<h3 className="font-medium text-sm mb-2">Keywords</h3>
									<div className="flex flex-wrap gap-2">
										{article.keywords_en?.map((keyword: string) => (
											<span key={keyword} className="px-2 py-1 bg-muted rounded text-xs">
												{keyword}
											</span>
										))}
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Authors */}
					<Card>
						<CardHeader>
							<h2 className="font-semibold text-lg">Autores</h2>
						</CardHeader>
						<CardContent>
							<div className="space-y-3">
								{article.authors?.map(
									(author: {
										id: string
										full_name: string
										affiliation?: string | null
										email?: string | null
										is_corresponding?: boolean | null
									}) => (
										<div
											key={author.id}
											className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
										>
											<User className="size-5 mt-0.5 text-muted-foreground" />
											<div>
												<p className="font-medium">{author.full_name}</p>
												{author.affiliation && (
													<p className="text-sm text-muted-foreground">{author.affiliation}</p>
												)}
												{author.email && (
													<p className="text-xs text-muted-foreground">{author.email}</p>
												)}
												{author.is_corresponding && (
													<span className="text-xs text-primary">Autor Correspondente</span>
												)}
											</div>
										</div>
									)
								)}
							</div>
						</CardContent>
					</Card>

					{/* Files */}
					<Card>
						<CardHeader>
							<h2 className="font-semibold text-lg">Arquivos</h2>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{article.versions?.map(
									(version: {
										id: string
										version_number: number
										version_label?: string | null
										created_at: string
									}) => (
										<div
											key={version.id}
											className="flex items-center justify-between p-3 rounded-lg border"
										>
											<div className="flex items-center gap-3">
												<FileText className="size-5 text-muted-foreground" />
												<div>
													<p className="font-medium text-sm">
														Versão {version.version_number}
														{version.version_label && ` - ${version.version_label}`}
													</p>
													<p className="text-xs text-muted-foreground">
														{new Date(version.created_at).toLocaleDateString()}
													</p>
												</div>
											</div>
											<Button size="sm" variant="outline">
												<Download className="size-4 mr-2" />
												Download
											</Button>
										</div>
									)
								)}
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Sidebar */}
				<div className="space-y-6">
					{/* Info Card */}
					<Card>
						<CardHeader>
							<h3 className="font-semibold">Informações</h3>
						</CardHeader>
						<CardContent className="space-y-3 text-sm">
							<div className="flex items-center gap-2">
								<Calendar className="size-4 text-muted-foreground" />
								<span className="text-muted-foreground">Submetido:</span>
								<span>
									{article.submitted_at ? new Date(article.submitted_at).toLocaleDateString() : "-"}
								</span>
							</div>
							<div className="flex items-center gap-2">
								<Clock className="size-4 text-muted-foreground" />
								<span className="text-muted-foreground">Atualizado:</span>
								<span>{new Date(article.updated_at).toLocaleDateString()}</span>
							</div>
							<div className="flex items-center gap-2">
								<FileText className="size-4 text-muted-foreground" />
								<span className="text-muted-foreground">Tipo:</span>
								<span className="capitalize">{article.article_type}</span>
							</div>
						</CardContent>
					</Card>

					{/* Timeline Placeholder */}
					<Card>
						<CardHeader>
							<h3 className="font-semibold">Timeline de Eventos</h3>
						</CardHeader>
						<CardContent>
							<p className="text-sm text-muted-foreground">📋 Timeline em desenvolvimento</p>
						</CardContent>
					</Card>

					{/* Reviews Placeholder */}
					<Card>
						<CardHeader>
							<h3 className="font-semibold">Revisões</h3>
						</CardHeader>
						<CardContent>
							<p className="text-sm text-muted-foreground">
								📝 Lista de revisões em desenvolvimento
							</p>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
