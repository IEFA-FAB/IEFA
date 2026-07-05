// Article Detail Page - Author's view of their submission

import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar, CheckCircle, Download, EditPencil, Group, Page, Upload, WarningTriangle } from "iconoir-react"
import { useRef, useState } from "react"
import { authQueryOptions } from "@/auth/service"
import { StatusBadge } from "@/components/journal/StatusBadge"
import { Button } from "@/components/ui/button"
import { uploadArticleFile } from "@/lib/journal/client"
import {
	articleAuthorsQueryOptions,
	articleVersionsQueryOptions,
	articleWithDetailsQueryOptions,
	authorArticleReviewsQueryOptions,
	signedFileUrlQueryOptions,
	useResubmitRevision,
} from "@/lib/journal/hooks"

export const Route = createFileRoute("/journal/submissions/$id")({
	beforeLoad: async ({ context }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions())
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth" })
		}
		return { auth }
	},
	loader: async ({ params, context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(articleWithDetailsQueryOptions(params.id)),
			context.queryClient.ensureQueryData(articleAuthorsQueryOptions(params.id)),
			context.queryClient.ensureQueryData(articleVersionsQueryOptions(params.id)),
			context.queryClient.ensureQueryData(authorArticleReviewsQueryOptions(params.id)),
		])
	},
	component: RouteComponent,
})

const REC_LABELS: Record<string, string> = {
	accept: "Aceitar",
	minor_revision: "Revisão Menor",
	major_revision: "Revisão Maior",
	reject: "Rejeitar",
}

function RouteComponent() {
	const { id } = Route.useParams()
	const { auth } = Route.useRouteContext()

	const { data: article } = useSuspenseQuery(articleWithDetailsQueryOptions(id))
	const { data: authors } = useSuspenseQuery(articleAuthorsQueryOptions(id))
	const { data: versions } = useSuspenseQuery(articleVersionsQueryOptions(id))
	const { data: reviewsData } = useSuspenseQuery(authorArticleReviewsQueryOptions(id))

	const articleData = article.article
	const isOwner = articleData.submitter_id === auth.user?.id
	const canEdit = isOwner && (articleData.status === "draft" || articleData.status === "revision_requested")

	return (
		<div className="container mx-auto max-w-5xl px-4 py-8">
			{/* Header */}
			<div className="mb-8">
				<div className="flex items-center gap-3 mb-4">
					<StatusBadge status={articleData.status} />
					<span className="text-sm text-muted-foreground">#{articleData.submission_number}</span>
				</div>

				<h1 className="text-3xl font-bold tracking-tight mb-2">{articleData.title_en || articleData.title_pt}</h1>

				<div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
					<div className="flex items-center gap-1">
						<Calendar className="size-4" />
						{articleData.submitted_at ? `Submetido em ${format(new Date(articleData.submitted_at), "dd MMMM yyyy", { locale: ptBR })}` : "Rascunho"}
					</div>
					<div className="flex items-center gap-1">
						<Page className="size-4" />
						<span className="capitalize">{articleData.article_type}</span>
					</div>
				</div>

				{canEdit && articleData.status === "draft" && (
					<div className="mt-4">
						<Link to="/journal/submit" search={{ step: 1 }}>
							<Button variant="outline">
								<EditPencil className="size-4 mr-2" />
								Editar Submissão
							</Button>
						</Link>
					</div>
				)}
			</div>

			<div className="space-y-6">
				{/* Decisão & Pareceres (visão do autor) */}
				{isOwner && <AuthorReviewsSection status={reviewsData.status} reviews={reviewsData.reviews} />}

				{/* Re-submissão de versão revisada */}
				{isOwner && articleData.status === "revision_requested" && <RevisionResubmit articleId={id} nextVersion={(versions[0]?.version_number ?? 1) + 1} />}

				{/* Metadata */}
				<div className="p-6 border rounded-lg">
					<h2 className="font-semibold text-lg mb-4">Metadados</h2>

					<div className="space-y-4">
						<div>
							<h3 className="text-sm font-medium text-muted-foreground mb-1">Título (PT)</h3>
							<p>{articleData.title_pt}</p>
						</div>

						<div>
							<h3 className="text-sm font-medium text-muted-foreground mb-1">Title (EN)</h3>
							<p>{articleData.title_en}</p>
						</div>

						<div>
							<h3 className="text-sm font-medium text-muted-foreground mb-1">Resumo (PT)</h3>
							<p className="text-sm">{articleData.abstract_pt}</p>
						</div>

						<div>
							<h3 className="text-sm font-medium text-muted-foreground mb-1">Palavras-chave</h3>
							<div className="flex flex-wrap gap-2">
								{articleData.keywords_pt?.map((kw: string, i: number) => (
									<span key={i} className="px-2 py-1 bg-primary/10 text-primary rounded text-sm">
										{kw}
									</span>
								))}
							</div>
						</div>
					</div>
				</div>

				{/* Authors */}
				<div className="p-6 border rounded-lg">
					<h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
						<Group className="size-5" />
						Autores ({authors.length})
					</h2>

					<div className="space-y-3">
						{authors.map((author) => (
							<div key={author.id} className="flex items-start gap-3 p-3 bg-muted rounded">
								<div className="font-medium">{author.author_order}.</div>
								<div className="flex-1">
									<div className="font-medium">
										{author.full_name}
										{author.is_corresponding && <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Correspondente</span>}
									</div>
									{author.affiliation && <div className="text-sm text-muted-foreground">{author.affiliation}</div>}
									{author.email && <div className="text-xs text-muted-foreground">{author.email}</div>}
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Files */}
				{versions.length > 0 && (
					<div className="p-6 border rounded-lg">
						<h2 className="font-semibold text-lg mb-4">Arquivos (Versão {versions[0].version_number})</h2>

						<div className="space-y-2">
							{versions[0].pdf_path && <SignedFileLink path={versions[0].pdf_path} label="Manuscrito (PDF)" />}
							{versions[0].source_path && <SignedFileLink path={versions[0].source_path} label="Arquivo Fonte" />}
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

// Link de download via URL assinada (bucket privado).
function SignedFileLink({ path, label }: { path: string; label: string }) {
	const { data: url, isLoading } = useQuery(signedFileUrlQueryOptions("journal-submissions", path))
	if (isLoading) {
		return (
			<div className="flex items-center gap-2 p-3 border rounded text-muted-foreground">
				<Download className="size-4" />
				<span>{label} (gerando link...)</span>
			</div>
		)
	}
	if (!url) return null
	return (
		<a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 border rounded hover:bg-accent">
			<Download className="size-4" />
			<span>{label}</span>
		</a>
	)
}

// Pareceres visíveis ao autor: só feedback qualitativo + recomendação, sem
// identidade do revisor e sem comentários confidenciais ao editor.
function AuthorReviewsSection({
	status,
	reviews,
}: {
	status: string
	reviews: {
		id: string
		label: string
		recommendation: string | null
		strengths: string | null
		weaknesses: string | null
		comments_for_authors: string | null
		submitted_at: string | null
	}[]
}) {
	const decided = ["revision_requested", "revised_submitted", "accepted", "rejected", "published"].includes(status)
	if (!decided && reviews.length === 0) return null

	return (
		<div className="p-6 border rounded-lg">
			<h2 className="font-semibold text-lg mb-4">Pareceres da Revisão</h2>
			{reviews.length === 0 ? (
				<p className="text-sm text-muted-foreground">Ainda não há pareceres liberados para visualização.</p>
			) : (
				<div className="space-y-4">
					{reviews.map((r) => (
						<div key={r.id} className="p-4 border rounded-lg space-y-3">
							<div className="flex items-center justify-between gap-2">
								<span className="font-medium text-sm">{r.label}</span>
								{r.recommendation && (
									<span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted">{REC_LABELS[r.recommendation] ?? r.recommendation}</span>
								)}
							</div>
							{r.strengths && (
								<div>
									<p className="text-xs font-medium text-muted-foreground">Pontos fortes</p>
									<p className="text-sm whitespace-pre-line">{r.strengths}</p>
								</div>
							)}
							{r.weaknesses && (
								<div>
									<p className="text-xs font-medium text-muted-foreground">Pontos a melhorar</p>
									<p className="text-sm whitespace-pre-line">{r.weaknesses}</p>
								</div>
							)}
							{r.comments_for_authors && (
								<div>
									<p className="text-xs font-medium text-muted-foreground">Comentários aos autores</p>
									<p className="text-sm whitespace-pre-line">{r.comments_for_authors}</p>
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	)
}

// Envio de versão revisada quando o status é revision_requested.
function RevisionResubmit({ articleId, nextVersion }: { articleId: string; nextVersion: number }) {
	const inputRef = useRef<HTMLInputElement>(null)
	const [file, setFile] = useState<File | null>(null)
	const [uploading, setUploading] = useState(false)
	const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null)
	const resubmit = useResubmitRevision()

	const handleSubmit = async () => {
		setBanner(null)
		if (!file) {
			setBanner({ kind: "error", text: "Selecione o PDF revisado." })
			return
		}
		try {
			setUploading(true)
			const pdfPath = await uploadArticleFile(articleId, nextVersion, file, "manuscript")
			await resubmit.mutateAsync({ articleId, pdfPath })
			setBanner({ kind: "success", text: "Versão revisada enviada. A submissão voltou para avaliação editorial." })
			setFile(null)
		} catch (err) {
			setBanner({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível enviar a versão revisada." })
		} finally {
			setUploading(false)
		}
	}

	return (
		<div className="p-6 border rounded-lg bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 space-y-4">
			<div>
				<h2 className="font-semibold text-lg">Enviar Versão Revisada</h2>
				<p className="text-sm text-muted-foreground">O editor solicitou revisão. Envie o manuscrito revisado (PDF) para uma nova rodada de avaliação.</p>
			</div>

			{banner && (
				<div
					className={`p-3 border rounded-lg text-sm flex items-center gap-2 ${banner.kind === "success" ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900 text-green-900 dark:text-green-100" : "bg-destructive/10 border-destructive/30 text-destructive"}`}
				>
					{banner.kind === "success" ? <CheckCircle className="size-4" /> : <WarningTriangle className="size-4" />}
					{banner.text}
				</div>
			)}

			<input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
			<div className="flex flex-wrap items-center gap-3">
				<Button variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
					<Upload className="size-4 mr-2" />
					{file ? "Trocar arquivo" : "Selecionar PDF"}
				</Button>
				{file && <span className="text-sm text-muted-foreground">{file.name}</span>}
				<Button onClick={handleSubmit} disabled={uploading || !file}>
					{uploading ? "Enviando..." : "Enviar Revisão"}
				</Button>
			</div>
		</div>
	)
}
