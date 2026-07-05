import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, Calendar, CheckCircle, Clock, Download, MessageText, Page, User, WarningTriangle, Xmark, XmarkCircle } from "iconoir-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { ArticleEvent, ArticleReviewWithAssignment, ReviewerDirectoryEntry } from "@/lib/journal/client"
import {
	articleEventsQueryOptions,
	articleReviewsQueryOptions,
	articleWithDetailsQueryOptions,
	journalSettingsQueryOptions,
	reviewersQueryOptions,
	useInviteReviewer,
	useUpdateArticle,
} from "@/lib/journal/hooks"
import type { ArticleStatus } from "@/lib/journal/types"

export const Route = createFileRoute("/journal/editorial/articles/$articleId")({
	loader: async ({ context, params }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(articleWithDetailsQueryOptions(params.articleId)),
			context.queryClient.ensureQueryData(articleReviewsQueryOptions(params.articleId)),
			context.queryClient.ensureQueryData(articleEventsQueryOptions(params.articleId)),
		])
	},
	component: ArticleDetailEditor,
})

const RECOMMENDATION_LABELS: Record<string, { label: string; className: string }> = {
	accept: { label: "Aceitar", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
	minor_revision: { label: "Revisão Menor", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
	major_revision: { label: "Revisão Maior", className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
	reject: { label: "Rejeitar", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
}

const EVENT_LABELS: Record<string, string> = {
	submitted: "Artigo submetido",
	status_changed: "Status alterado",
	reviewer_invited: "Revisor convidado",
	review_completed: "Parecer recebido",
	published: "Artigo publicado",
}

function ArticleDetailEditor() {
	const { articleId } = Route.useParams()
	// get_article_details retorna jsonb aninhado: { article, authors, versions, reviews }.
	const { data: details } = useSuspenseQuery(articleWithDetailsQueryOptions(articleId))
	const article = details.article
	const authors = details.authors ?? []
	const versions = details.versions ?? []
	const { data: reviews } = useSuspenseQuery(articleReviewsQueryOptions(articleId))
	const { data: events } = useSuspenseQuery(articleEventsQueryOptions(articleId))

	const updateArticle = useUpdateArticle()
	const [inviteOpen, setInviteOpen] = useState(false)
	const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null)

	const decide = async (status: ArticleStatus, message: string) => {
		setBanner(null)
		try {
			await updateArticle.mutateAsync({ articleId, updates: { status } })
			setBanner({ kind: "success", text: message })
		} catch (err) {
			setBanner({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível atualizar o status." })
		}
	}

	return (
		<div className="space-y-6">
			{/* Header with back button */}
			<div className="flex items-center gap-4">
				<Button
					nativeButton={false}
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
							<span className="text-sm font-mono text-muted-foreground">#{article.submission_number}</span>
							<span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted capitalize">{article.status}</span>
						</div>
						<h1 className="text-3xl font-bold tracking-tight mb-2">{article.title_pt}</h1>
						<p className="text-lg text-muted-foreground">{article.title_en}</p>
					</div>
				</div>

				{banner && (
					<div
						className={`p-3 border rounded-lg text-sm flex items-center gap-2 ${
							banner.kind === "success"
								? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900 text-green-900 dark:text-green-100"
								: "bg-destructive/10 border-destructive/30 text-destructive"
						}`}
					>
						{banner.kind === "success" ? <CheckCircle className="size-4" /> : <WarningTriangle className="size-4" />}
						{banner.text}
					</div>
				)}

				{/* Quick Actions */}
				<div className="flex gap-2 flex-wrap">
					<Button variant="default" onClick={() => decide("accepted", "Artigo marcado como aceito.")} disabled={updateArticle.isPending}>
						<CheckCircle className="size-4 mr-2" />
						Aceitar
					</Button>
					<Button variant="outline" onClick={() => decide("revision_requested", "Revisão solicitada ao autor.")} disabled={updateArticle.isPending}>
						<MessageText className="size-4 mr-2" />
						Solicitar Revisão
					</Button>
					<Button variant="outline" onClick={() => setInviteOpen(true)}>
						<User className="size-4 mr-2" />
						Convidar Revisor
					</Button>
					<Button variant="destructive" onClick={() => decide("rejected", "Artigo rejeitado.")} disabled={updateArticle.isPending}>
						<XmarkCircle className="size-4 mr-2" />
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
								{authors.map(
									(author: { id: string; full_name: string; affiliation?: string | null; email?: string | null; is_corresponding?: boolean | null }) => (
										<div key={author.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
											<User className="size-5 mt-0.5 text-muted-foreground" />
											<div>
												<p className="font-medium">{author.full_name}</p>
												{author.affiliation && <p className="text-sm text-muted-foreground">{author.affiliation}</p>}
												{author.email && <p className="text-xs text-muted-foreground">{author.email}</p>}
												{author.is_corresponding && <span className="text-xs text-primary">Autor Correspondente</span>}
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
								{versions.map((version: { id: string; version_number: number; version_label?: string | null; created_at: string }) => (
									<div key={version.id} className="flex items-center justify-between p-3 rounded-lg border">
										<div className="flex items-center gap-3">
											<Page className="size-5 text-muted-foreground" />
											<div>
												<p className="font-medium text-sm">
													Versão {version.version_number}
													{version.version_label && ` - ${version.version_label}`}
												</p>
												<p className="text-xs text-muted-foreground">{new Date(version.created_at).toLocaleDateString("pt-BR")}</p>
											</div>
										</div>
										<Button size="sm" variant="outline">
											<Download className="size-4 mr-2" />
											Download
										</Button>
									</div>
								))}
							</div>
						</CardContent>
					</Card>

					{/* Reviews */}
					<Card>
						<CardHeader>
							<h2 className="font-semibold text-lg">Pareceres ({reviews.length})</h2>
						</CardHeader>
						<CardContent>
							{reviews.length === 0 ? (
								<p className="text-sm text-muted-foreground">Nenhum parecer recebido ainda. Convide revisores para iniciar a avaliação.</p>
							) : (
								<div className="space-y-4">
									{reviews.map((review) => (
										<ReviewCard key={review.id} review={review} />
									))}
								</div>
							)}
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
								<span>{article.submitted_at ? new Date(article.submitted_at).toLocaleDateString("pt-BR") : "-"}</span>
							</div>
							<div className="flex items-center gap-2">
								<Clock className="size-4 text-muted-foreground" />
								<span className="text-muted-foreground">Atualizado:</span>
								<span>{new Date(article.updated_at).toLocaleDateString("pt-BR")}</span>
							</div>
							<div className="flex items-center gap-2">
								<Page className="size-4 text-muted-foreground" />
								<span className="text-muted-foreground">Tipo:</span>
								<span className="capitalize">{article.article_type}</span>
							</div>
						</CardContent>
					</Card>

					{/* Timeline */}
					<Card>
						<CardHeader>
							<h3 className="font-semibold">Timeline de Eventos</h3>
						</CardHeader>
						<CardContent>
							{events.length === 0 ? (
								<p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
							) : (
								<ol className="space-y-4">
									{events.map((event) => (
										<TimelineItem key={event.id} event={event} />
									))}
								</ol>
							)}
						</CardContent>
					</Card>
				</div>
			</div>

			{inviteOpen && (
				<InviteReviewerDialog articleId={articleId} onClose={() => setInviteOpen(false)} onDone={(text) => setBanner({ kind: "success", text })} />
			)}
		</div>
	)
}

function ReviewCard({ review }: { review: ArticleReviewWithAssignment }) {
	const rec = review.recommendation ? RECOMMENDATION_LABELS[review.recommendation] : null
	return (
		<div className="p-4 border rounded-lg space-y-3">
			<div className="flex items-center justify-between gap-2">
				<div className="text-sm">
					<p className="font-medium">{review.assignment?.invitation_email ?? "Revisor"}</p>
					<p className="text-xs text-muted-foreground">{review.submitted_at ? new Date(review.submitted_at).toLocaleDateString("pt-BR") : ""}</p>
				</div>
				{rec && <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${rec.className}`}>{rec.label}</span>}
			</div>

			<div className="grid grid-cols-5 gap-2 text-center">
				<ScorePill label="Orig." value={review.score_originality} />
				<ScorePill label="Metod." value={review.score_methodology} />
				<ScorePill label="Clareza" value={review.score_clarity} />
				<ScorePill label="Refs." value={review.score_references} />
				<ScorePill label="Geral" value={review.score_overall} highlight />
			</div>

			{review.strengths && (
				<div>
					<p className="text-xs font-medium text-muted-foreground">Pontos fortes</p>
					<p className="text-sm whitespace-pre-line">{review.strengths}</p>
				</div>
			)}
			{review.weaknesses && (
				<div>
					<p className="text-xs font-medium text-muted-foreground">Pontos fracos</p>
					<p className="text-sm whitespace-pre-line">{review.weaknesses}</p>
				</div>
			)}
			<div>
				<p className="text-xs font-medium text-muted-foreground">Comentários aos autores</p>
				<p className="text-sm whitespace-pre-line">{review.comments_for_authors}</p>
			</div>
			{review.comments_for_editors && (
				<div>
					<p className="text-xs font-medium text-muted-foreground">Confidencial (editores)</p>
					<p className="text-sm whitespace-pre-line">{review.comments_for_editors}</p>
				</div>
			)}
			{(review.has_methodology_issues || review.has_statistical_errors || review.has_ethical_concerns || review.suspected_plagiarism) && (
				<div className="flex flex-wrap gap-2 pt-1">
					{review.has_methodology_issues && <Flag text="Problemas metodológicos" />}
					{review.has_statistical_errors && <Flag text="Erros estatísticos" />}
					{review.has_ethical_concerns && <Flag text="Preocupações éticas" />}
					{review.suspected_plagiarism && <Flag text="Suspeita de plágio" />}
				</div>
			)}
		</div>
	)
}

function Flag({ text }: { text: string }) {
	return <span className="px-2 py-0.5 rounded text-xs bg-destructive/10 text-destructive">{text}</span>
}

function ScorePill({ label, value, highlight = false }: { label: string; value: number | null; highlight?: boolean }) {
	return (
		<div className={`rounded-md border p-1.5 ${highlight ? "bg-primary/5 border-primary/40" : ""}`}>
			<p className="text-[10px] text-muted-foreground">{label}</p>
			<p className="text-sm font-semibold">{value ?? "-"}</p>
		</div>
	)
}

function TimelineItem({ event }: { event: ArticleEvent }) {
	const label = EVENT_LABELS[event.event_type] ?? event.event_type
	const data = event.event_data ?? {}
	let detail = ""
	if (event.event_type === "status_changed") detail = `${data.old_status ?? "?"} → ${data.new_status ?? "?"}`
	else if (event.event_type === "review_completed" && data.recommendation)
		detail = `Recomendação: ${RECOMMENDATION_LABELS[String(data.recommendation)]?.label ?? data.recommendation}`
	else if (event.event_type === "reviewer_invited" && data.invitation_email) detail = String(data.invitation_email)

	return (
		<li className="flex gap-3">
			<div className="mt-1 size-2 rounded-full bg-primary shrink-0" />
			<div className="text-sm">
				<p className="font-medium">{label}</p>
				{detail && <p className="text-xs text-muted-foreground">{detail}</p>}
				<p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR")}</p>
			</div>
		</li>
	)
}

function InviteReviewerDialog({ articleId, onClose, onDone }: { articleId: string; onClose: () => void; onDone: (text: string) => void }) {
	// useQuery (não-suspense): os dados do diálogo não estão no loader da rota,
	// então useSuspenseQuery dispararia o Suspense de nível de rota e piscaria a
	// página inteira ao abrir. Aqui carregamos com estado de loading local.
	const { data: reviewers, isLoading: loadingReviewers } = useQuery(reviewersQueryOptions())
	const { data: settings } = useQuery(journalSettingsQueryOptions())
	const inviteMutation = useInviteReviewer()

	const defaultDays = settings?.default_review_deadline_days ?? 21
	const defaultDue = new Date(Date.now() + defaultDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

	const [reviewerId, setReviewerId] = useState("")
	const [dueDate, setDueDate] = useState(defaultDue)
	const [error, setError] = useState<string | null>(null)

	const selectableReviewers = (reviewers ?? []).filter((r) => r.email)

	const handleInvite = async () => {
		setError(null)
		if (!reviewerId) {
			setError("Selecione um revisor.")
			return
		}
		try {
			await inviteMutation.mutateAsync({ articleId, reviewerId, dueDate: new Date(dueDate).toISOString() })
			const reviewer = (reviewers ?? []).find((r) => r.id === reviewerId)
			onDone(`Convite enviado a ${reviewer?.full_name ?? "revisor"}.`)
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : "Não foi possível enviar o convite.")
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			{/* Backdrop clicável (button semântico, evita violação de a11y) */}
			<button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/50 cursor-default" />
			<div className="relative w-full max-w-md rounded-lg bg-card border shadow-lg p-6 space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold">Convidar Revisor</h3>
					<button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
						<Xmark className="size-5" />
					</button>
				</div>

				{loadingReviewers ? (
					<p className="text-sm text-muted-foreground">Carregando revisores...</p>
				) : selectableReviewers.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nenhum revisor disponível. Cadastre usuários com função "reviewer" ou "editor".</p>
				) : (
					<>
						<div className="space-y-2">
							<label htmlFor="reviewer-select" className="text-sm font-medium">
								Revisor
							</label>
							<select
								id="reviewer-select"
								value={reviewerId}
								onChange={(e) => setReviewerId(e.target.value)}
								className="w-full px-3 py-2 border rounded-md bg-background text-sm"
							>
								<option value="">Selecione...</option>
								{selectableReviewers.map((r: ReviewerDirectoryEntry) => (
									<option key={r.id} value={r.id}>
										{r.full_name} ({r.role}) — {r.email}
									</option>
								))}
							</select>
						</div>

						<div className="space-y-2">
							<label htmlFor="due-date" className="text-sm font-medium">
								Prazo para revisão
							</label>
							<input
								id="due-date"
								type="date"
								value={dueDate}
								onChange={(e) => setDueDate(e.target.value)}
								className="w-full px-3 py-2 border rounded-md bg-background text-sm"
							/>
						</div>

						{error && <p className="text-sm text-destructive">{error}</p>}

						<div className="flex justify-end gap-2 pt-2">
							<Button variant="outline" onClick={onClose} disabled={inviteMutation.isPending}>
								Cancelar
							</Button>
							<Button onClick={handleInvite} disabled={inviteMutation.isPending}>
								{inviteMutation.isPending ? "Enviando..." : "Enviar Convite"}
							</Button>
						</div>
					</>
				)}
			</div>
		</div>
	)
}
