import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, CheckCircle, Download, FloppyDisk, SendDiagonal, WarningTriangle } from "iconoir-react"
import { useState } from "react"
import { authQueryOptions } from "@/auth/service"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { getArticleFileUrl } from "@/lib/journal/client"
import {
	articleVersionsQueryOptions,
	reviewAssignmentQueryOptions,
	reviewQueryOptions,
	userProfileQueryOptions,
	useSaveReviewDraft,
	useSubmitReview,
} from "@/lib/journal/hooks"
import type { Review } from "@/lib/journal/types"

export const Route = createFileRoute("/journal/review/assignment/$assignmentId")({
	beforeLoad: async ({ context, params, location }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions())
		if (!auth.isAuthenticated || !auth.user) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}

		const assignment = await context.queryClient.ensureQueryData(reviewAssignmentQueryOptions(params.assignmentId))
		const profile = await context.queryClient.ensureQueryData(userProfileQueryOptions(auth.user.id))
		const isOwner = assignment.reviewer_id === auth.user.id
		const isEditor = profile?.role === "editor"
		// Só o revisor designado (ou um editor, para acompanhamento) acessa o parecer.
		if (!isOwner && !isEditor) {
			throw redirect({ to: "/journal/review" })
		}

		return {
			auth: auth as typeof auth & { user: NonNullable<typeof auth.user> },
			canEdit: isOwner && (assignment.status === "accepted" || assignment.status === "completed"),
		}
	},
	loader: async ({ context, params }) => {
		const assignment = await context.queryClient.ensureQueryData(reviewAssignmentQueryOptions(params.assignmentId))
		await Promise.all([
			context.queryClient.ensureQueryData(reviewQueryOptions(params.assignmentId)),
			assignment.article_id ? context.queryClient.ensureQueryData(articleVersionsQueryOptions(assignment.article_id)) : Promise.resolve(),
		])
	},
	component: ReviewSubmission,
})

type ReviewRecommendation = "accept" | "minor_revision" | "major_revision" | "reject"

interface ReviewFormData {
	score_originality: number
	score_methodology: number
	score_clarity: number
	score_references: number
	score_overall: number
	strengths: string
	weaknesses: string
	comments_for_authors: string
	comments_for_editors: string
	recommendation: ReviewRecommendation | ""
	has_methodology_issues: boolean
	has_statistical_errors: boolean
	has_ethical_concerns: boolean
	suspected_plagiarism: boolean
}

function initialFormData(existing: Review | null): ReviewFormData {
	return {
		score_originality: existing?.score_originality ?? 0,
		score_methodology: existing?.score_methodology ?? 0,
		score_clarity: existing?.score_clarity ?? 0,
		score_references: existing?.score_references ?? 0,
		score_overall: existing?.score_overall ?? 0,
		strengths: existing?.strengths ?? "",
		weaknesses: existing?.weaknesses ?? "",
		comments_for_authors: existing?.comments_for_authors ?? "",
		comments_for_editors: existing?.comments_for_editors ?? "",
		recommendation: (existing?.recommendation as ReviewRecommendation | undefined) ?? "",
		has_methodology_issues: existing?.has_methodology_issues ?? false,
		has_statistical_errors: existing?.has_statistical_errors ?? false,
		has_ethical_concerns: existing?.has_ethical_concerns ?? false,
		suspected_plagiarism: existing?.suspected_plagiarism ?? false,
	}
}

function ReviewSubmission() {
	const { assignmentId } = Route.useParams()
	const { canEdit } = Route.useRouteContext()
	const navigate = useNavigate()

	const { data: assignment } = useSuspenseQuery(reviewAssignmentQueryOptions(assignmentId))
	const { data: existingReview } = useSuspenseQuery(reviewQueryOptions(assignmentId))
	const { data: versions } = useSuspenseQuery(articleVersionsQueryOptions(assignment.article_id))

	const saveDraftMutation = useSaveReviewDraft()
	const submitMutation = useSubmitReview()
	const isSaving = saveDraftMutation.isPending
	const isSubmitting = submitMutation.isPending

	const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null)
	const [formData, setFormData] = useState<ReviewFormData>(() => initialFormData(existingReview))

	const readOnly = !canEdit || assignment.status === "completed"
	const latestVersion = versions?.[0]
	const manuscriptUrl = latestVersion?.pdf_path ? getArticleFileUrl("journal-submissions", latestVersion.pdf_path) : null

	const updateField = <K extends keyof ReviewFormData>(field: K, value: ReviewFormData[K]) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
	}

	// Rascunho: envia só valores válidos (scores 0 e recomendação vazia são omitidos,
	// pois violariam os CHECK/NOT NULL de `reviews`).
	const toDraftData = (): Partial<Review> => {
		const out: Partial<Review> = {
			strengths: formData.strengths,
			weaknesses: formData.weaknesses,
			comments_for_authors: formData.comments_for_authors,
			comments_for_editors: formData.comments_for_editors,
			has_methodology_issues: formData.has_methodology_issues,
			has_statistical_errors: formData.has_statistical_errors,
			has_ethical_concerns: formData.has_ethical_concerns,
			suspected_plagiarism: formData.suspected_plagiarism,
		}
		if (formData.score_originality) out.score_originality = formData.score_originality
		if (formData.score_methodology) out.score_methodology = formData.score_methodology
		if (formData.score_clarity) out.score_clarity = formData.score_clarity
		if (formData.score_references) out.score_references = formData.score_references
		if (formData.score_overall) out.score_overall = formData.score_overall
		if (formData.recommendation) out.recommendation = formData.recommendation
		return out
	}

	// Submissão: todos os campos obrigatórios já validados abaixo.
	const toSubmitData = (): Partial<Review> => ({
		score_originality: formData.score_originality,
		score_methodology: formData.score_methodology,
		score_clarity: formData.score_clarity,
		score_references: formData.score_references,
		score_overall: formData.score_overall,
		strengths: formData.strengths,
		weaknesses: formData.weaknesses,
		comments_for_authors: formData.comments_for_authors,
		comments_for_editors: formData.comments_for_editors,
		recommendation: formData.recommendation as ReviewRecommendation,
		has_methodology_issues: formData.has_methodology_issues,
		has_statistical_errors: formData.has_statistical_errors,
		has_ethical_concerns: formData.has_ethical_concerns,
		suspected_plagiarism: formData.suspected_plagiarism,
	})

	const handleSaveDraft = async () => {
		setBanner(null)
		try {
			await saveDraftMutation.mutateAsync({ assignmentId, reviewData: toDraftData() })
			setBanner({ kind: "success", text: "Rascunho salvo com sucesso." })
		} catch (err) {
			setBanner({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível salvar o rascunho." })
		}
	}

	const handleSubmit = async () => {
		setBanner(null)
		if (!formData.score_originality || !formData.score_methodology || !formData.score_clarity || !formData.score_references || !formData.score_overall) {
			setBanner({ kind: "error", text: "Preencha todas as avaliações por critério (1 a 5)." })
			return
		}
		if (!formData.comments_for_authors.trim()) {
			setBanner({ kind: "error", text: "Forneça comentários para os autores." })
			return
		}
		if (!formData.recommendation) {
			setBanner({ kind: "error", text: "Selecione uma recomendação." })
			return
		}
		if (!window.confirm("Tem certeza de que deseja submeter esta revisão? Esta ação não pode ser desfeita.")) return

		try {
			await submitMutation.mutateAsync({ assignmentId, reviewData: toSubmitData() })
			navigate({ to: "/journal/review" })
		} catch (err) {
			setBanner({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível submeter a revisão." })
		}
	}

	return (
		<div className="max-w-5xl mx-auto space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Formulário de Revisão</h1>
					<p className="text-muted-foreground">{assignment.article?.title_pt ?? "Artigo a ser revisado"}</p>
				</div>
				<Button variant="outline" onClick={() => navigate({ to: "/journal/review" })}>
					<ArrowLeft className="size-4 mr-2" />
					Voltar
				</Button>
			</div>

			{assignment.status === "completed" && (
				<div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900 flex items-center gap-2">
					<CheckCircle className="size-5 text-green-600" />
					<p className="text-sm text-green-900 dark:text-green-100">Revisão já submetida. Exibindo em modo somente leitura.</p>
				</div>
			)}

			<div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900 flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm text-blue-900 dark:text-blue-100">
					📅 Prazo: <strong>{new Date(assignment.due_date).toLocaleDateString("pt-BR")}</strong>
				</p>
				{manuscriptUrl && (
					<a
						href={manuscriptUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline"
					>
						<Download className="size-4" />
						Baixar manuscrito (PDF)
					</a>
				)}
			</div>

			{/* Resumo do artigo */}
			{assignment.article?.abstract_pt && (
				<div className="p-6 border rounded-lg bg-card space-y-2">
					<h2 className="text-lg font-semibold">Resumo do Artigo</h2>
					<p className="text-sm text-muted-foreground whitespace-pre-line">{assignment.article.abstract_pt}</p>
				</div>
			)}

			{banner && (
				<div
					className={`p-4 border rounded-lg text-sm flex items-center gap-2 ${
						banner.kind === "success"
							? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900 text-green-900 dark:text-green-100"
							: "bg-destructive/10 border-destructive/30 text-destructive"
					}`}
				>
					{banner.kind === "success" ? <CheckCircle className="size-4" /> : <WarningTriangle className="size-4" />}
					{banner.text}
				</div>
			)}

			{/* Scoring */}
			<fieldset disabled={readOnly} className="p-6 border rounded-lg bg-card space-y-6 disabled:opacity-70">
				<div>
					<h2 className="text-xl font-semibold">Avaliação por Critérios</h2>
					<p className="text-sm text-muted-foreground">Avalie cada aspecto do artigo de 1 (muito ruim) a 5 (excelente)</p>
				</div>
				<div className="grid md:grid-cols-2 gap-6">
					<ScoreInput label="Originalidade" value={formData.score_originality} onChange={(v) => updateField("score_originality", v)} />
					<ScoreInput label="Metodologia" value={formData.score_methodology} onChange={(v) => updateField("score_methodology", v)} />
					<ScoreInput label="Clareza e Organização" value={formData.score_clarity} onChange={(v) => updateField("score_clarity", v)} />
					<ScoreInput label="Qualidade das Referências" value={formData.score_references} onChange={(v) => updateField("score_references", v)} />
					<ScoreInput label="Avaliação Geral" value={formData.score_overall} onChange={(v) => updateField("score_overall", v)} highlight />
				</div>
			</fieldset>

			{/* Feedback */}
			<fieldset disabled={readOnly} className="p-6 border rounded-lg bg-card space-y-6 disabled:opacity-70">
				<h2 className="text-xl font-semibold">Feedback Detalhado</h2>

				<div className="space-y-2">
					<Label htmlFor="strengths">Pontos Fortes</Label>
					<textarea
						id="strengths"
						value={formData.strengths}
						onChange={(e) => updateField("strengths", e.target.value)}
						placeholder="Descreva os principais pontos fortes do manuscrito..."
						className="w-full px-3 py-2 border rounded-md min-h-[100px] bg-background"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="weaknesses">Pontos Fracos / Limitações</Label>
					<textarea
						id="weaknesses"
						value={formData.weaknesses}
						onChange={(e) => updateField("weaknesses", e.target.value)}
						placeholder="Descreva as principais limitações ou pontos que precisam ser melhorados..."
						className="w-full px-3 py-2 border rounded-md min-h-[100px] bg-background"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="comments_authors">
						Comentários para os Autores <span className="text-destructive">*</span>
					</Label>
					<textarea
						id="comments_authors"
						value={formData.comments_for_authors}
						onChange={(e) => updateField("comments_for_authors", e.target.value)}
						placeholder="Forneça feedback detalhado e construtivo para os autores. Seja específico e cite seções/páginas quando possível..."
						className="w-full px-3 py-2 border rounded-md min-h-[200px] bg-background"
					/>
					<p className="text-xs text-muted-foreground">Este comentário será compartilhado com os autores</p>
				</div>

				<div className="space-y-2">
					<Label htmlFor="comments_editors">Comentários Confidenciais para os Editores</Label>
					<textarea
						id="comments_editors"
						value={formData.comments_for_editors}
						onChange={(e) => updateField("comments_for_editors", e.target.value)}
						placeholder="Comentários privados que não serão compartilhados com os autores..."
						className="w-full px-3 py-2 border rounded-md min-h-[120px] bg-background"
					/>
					<p className="text-xs text-muted-foreground">Apenas os editores verão este comentário</p>
				</div>
			</fieldset>

			{/* Recommendation */}
			<fieldset disabled={readOnly} className="p-6 border rounded-lg bg-card space-y-4 disabled:opacity-70">
				<h2 className="text-xl font-semibold">
					Recomendação <span className="text-destructive">*</span>
				</h2>
				<div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
					<RecommendationOption
						label="Aceitar"
						description="Pronto para publicação"
						selected={formData.recommendation === "accept"}
						onClick={() => updateField("recommendation", "accept")}
						color="green"
					/>
					<RecommendationOption
						label="Revisão Menor"
						description="Pequenos ajustes necessários"
						selected={formData.recommendation === "minor_revision"}
						onClick={() => updateField("recommendation", "minor_revision")}
						color="blue"
					/>
					<RecommendationOption
						label="Revisão Maior"
						description="Mudanças substanciais necessárias"
						selected={formData.recommendation === "major_revision"}
						onClick={() => updateField("recommendation", "major_revision")}
						color="orange"
					/>
					<RecommendationOption
						label="Rejeitar"
						description="Não adequado para publicação"
						selected={formData.recommendation === "reject"}
						onClick={() => updateField("recommendation", "reject")}
						color="red"
					/>
				</div>
			</fieldset>

			{/* Concerns */}
			<fieldset disabled={readOnly} className="p-6 border rounded-lg bg-card space-y-4 disabled:opacity-70">
				<h2 className="text-xl font-semibold">Preocupações Identificadas</h2>
				<p className="text-sm text-muted-foreground">Marque se identificou algum dos problemas abaixo:</p>
				<div className="space-y-3">
					<ConcernCheck
						label="Problemas Metodológicos"
						description="Falhas no desenho do estudo ou execução"
						checked={formData.has_methodology_issues}
						onChange={(v) => updateField("has_methodology_issues", v)}
					/>
					<ConcernCheck
						label="Erros Estatísticos"
						description="Análises estatísticas incorretas ou inadequadas"
						checked={formData.has_statistical_errors}
						onChange={(v) => updateField("has_statistical_errors", v)}
					/>
					<ConcernCheck
						label="Preocupações Éticas"
						description="Questões relacionadas à ética em pesquisa"
						checked={formData.has_ethical_concerns}
						onChange={(v) => updateField("has_ethical_concerns", v)}
					/>
					<ConcernCheck
						label="Suspeita de Plágio"
						description="Possível plágio ou auto-plágio identificado"
						checked={formData.suspected_plagiarism}
						onChange={(v) => updateField("suspected_plagiarism", v)}
					/>
				</div>
			</fieldset>

			{/* Actions */}
			{!readOnly && (
				<div className="flex gap-3 justify-end sticky bottom-4 p-4 border rounded-lg bg-card shadow-lg">
					<Button variant="outline" onClick={handleSaveDraft} disabled={isSaving || isSubmitting}>
						<FloppyDisk className="size-4 mr-2" />
						{isSaving ? "Salvando..." : "Salvar Rascunho"}
					</Button>
					<Button onClick={handleSubmit} disabled={isSaving || isSubmitting}>
						<SendDiagonal className="size-4 mr-2" />
						{isSubmitting ? "Submetendo..." : "Submeter Revisão"}
					</Button>
				</div>
			)}

			{readOnly && assignment.status !== "completed" && (
				<div className="p-4 border rounded-lg bg-muted text-sm text-muted-foreground">
					Você precisa aceitar o convite antes de preencher o parecer.{" "}
					<Link to="/journal/review/$token" params={{ token: assignment.invitation_token }} className="text-primary underline">
						Responder convite
					</Link>
				</div>
			)}
		</div>
	)
}

function ConcernCheck({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
	return (
		<label className="flex items-center gap-3 cursor-pointer">
			<input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 rounded" />
			<div>
				<p className="font-medium">{label}</p>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
		</label>
	)
}

function ScoreInput({ label, value, onChange, highlight = false }: { label: string; value: number; onChange: (value: number) => void; highlight?: boolean }) {
	return (
		<div className={`space-y-2 ${highlight ? "p-3 border rounded-lg bg-primary/5" : ""}`}>
			<Label>
				{label} {highlight && <span className="text-destructive">*</span>}
			</Label>
			<div className="flex gap-2">
				{[1, 2, 3, 4, 5].map((score) => (
					<button
						key={score}
						type="button"
						onClick={() => onChange(score)}
						className={`flex-1 px-3 py-2 border rounded-md font-medium transition-colors ${
							value === score ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
						}`}
					>
						{score}
					</button>
				))}
			</div>
			<div className="flex justify-between text-xs text-muted-foreground">
				<span>Muito Ruim</span>
				<span>Excelente</span>
			</div>
		</div>
	)
}

function RecommendationOption({
	label,
	description,
	selected,
	onClick,
	color,
}: {
	label: string
	description: string
	selected: boolean
	onClick: () => void
	color: "green" | "blue" | "orange" | "red"
}) {
	const colorClasses = {
		green: selected ? "border-green-500 bg-green-50 dark:bg-green-950" : "border-gray-200 hover:border-green-300",
		blue: selected ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-gray-200 hover:border-blue-300",
		orange: selected ? "border-orange-500 bg-orange-50 dark:bg-orange-950" : "border-gray-200 hover:border-orange-300",
		red: selected ? "border-red-500 bg-red-50 dark:bg-red-950" : "border-gray-200 hover:border-red-300",
	}

	return (
		<button type="button" onClick={onClick} className={`p-4 border-2 rounded-lg text-left transition-colors ${colorClasses[color]}`}>
			<p className="font-semibold mb-1">{label}</p>
			<p className="text-xs text-muted-foreground">{description}</p>
		</button>
	)
}
