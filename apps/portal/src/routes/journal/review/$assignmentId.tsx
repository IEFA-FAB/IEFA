import { Button, Label } from "@iefa/ui"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Save, Send } from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/journal/review/$assignmentId")({
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

function ReviewSubmission() {
	Route.useParams()
	const navigate = useNavigate()
	const [isSaving, setIsSaving] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)

	const [formData, setFormData] = useState<ReviewFormData>({
		score_originality: 0,
		score_methodology: 0,
		score_clarity: 0,
		score_references: 0,
		score_overall: 0,
		strengths: "",
		weaknesses: "",
		comments_for_authors: "",
		comments_for_editors: "",
		recommendation: "",
		has_methodology_issues: false,
		has_statistical_errors: false,
		has_ethical_concerns: false,
		suspected_plagiarism: false,
	})

	// Placeholder - will fetch review assignment data
	const assignment = {
		article_title: "Título do Artigo a Ser Revisado",
		due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
	}

	const updateField = <K extends keyof ReviewFormData>(field: K, value: ReviewFormData[K]) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
	}

	const handleSaveDraft = async () => {
		setIsSaving(true)
		// TODO: Call saveReviewDraft mutation
		setTimeout(() => {
			setIsSaving(false)
			alert("Rascunho salvo com sucesso!")
		}, 500)
	}

	const handleSubmit = async () => {
		// Validate required fields
		if (
			!formData.score_originality ||
			!formData.score_methodology ||
			!formData.score_clarity ||
			!formData.score_references ||
			!formData.score_overall
		) {
			alert("Por favor, preencha todas as avaliações de score.")
			return
		}

		if (!formData.comments_for_authors.trim()) {
			alert("Por favor, forneça comentários para os autores.")
			return
		}

		if (!formData.recommendation) {
			alert("Por favor, selecione uma recomendação.")
			return
		}

		const confirmed = window.confirm(
			"Tem certeza de que deseja submeter esta revisão? Esta ação não pode ser desfeita."
		)

		if (!confirmed) return

		setIsSubmitting(true)
		// TODO: Call submitReview mutation
		setTimeout(() => {
			navigate({ to: "/journal/review" })
		}, 1000)
	}

	return (
		<div className="max-w-5xl mx-auto space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Formulário de Revisão</h1>
					<p className="text-muted-foreground">{assignment.article_title}</p>
				</div>
				<Button variant="outline" onClick={() => navigate({ to: "/journal/review" })}>
					<ArrowLeft className="size-4 mr-2" />
					Voltar
				</Button>
			</div>

			<div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900">
				<p className="text-sm text-blue-900 dark:text-blue-100">
					📅 Prazo para submissão:{" "}
					<strong>{new Date(assignment.due_date).toLocaleDateString("pt-BR")}</strong>
				</p>
			</div>

			{/* Scoring Section */}
			<div className="p-6 border rounded-lg bg-card space-y-6">
				<h2 className="text-xl font-semibold">Avaliação por Critérios</h2>
				<p className="text-sm text-muted-foreground">
					Avalie cada aspecto do artigo de 1 (muito ruim) a 5 (excelente)
				</p>

				<div className="grid md:grid-cols-2 gap-6">
					<ScoreInput
						label="Originalidade"
						value={formData.score_originality}
						onChange={(v) => updateField("score_originality", v)}
					/>
					<ScoreInput
						label="Metodologia"
						value={formData.score_methodology}
						onChange={(v) => updateField("score_methodology", v)}
					/>
					<ScoreInput
						label="Clareza e Organização"
						value={formData.score_clarity}
						onChange={(v) => updateField("score_clarity", v)}
					/>
					<ScoreInput
						label="Qualidade das Referências"
						value={formData.score_references}
						onChange={(v) => updateField("score_references", v)}
					/>
					<ScoreInput
						label="Avaliação Geral"
						value={formData.score_overall}
						onChange={(v) => updateField("score_overall", v)}
						highlight
					/>
				</div>
			</div>

			{/* Feedback Section */}
			<div className="p-6 border rounded-lg bg-card space-y-6">
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
						required
					/>
					<p className="text-xs text-muted-foreground">
						Este comentário será compartilhado com os autores
					</p>
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
			</div>

			{/* Recommendation */}
			<div className="p-6 border rounded-lg bg-card space-y-4">
				<h2 className="text-xl font-semibold">
					Recomendação <span className="text-destructive">*</span>
				</h2>
				<div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
					<RecommendationOption
						value="accept"
						label="Aceitar"
						description="Pronto para publicação"
						selected={formData.recommendation === "accept"}
						onClick={() => updateField("recommendation", "accept")}
						color="green"
					/>
					<RecommendationOption
						value="minor_revision"
						label="Revisão Menor"
						description="Pequenos ajustes necessários"
						selected={formData.recommendation === "minor_revision"}
						onClick={() => updateField("recommendation", "minor_revision")}
						color="blue"
					/>
					<RecommendationOption
						value="major_revision"
						label="Revisão Maior"
						description="Mudanças substanciais necessárias"
						selected={formData.recommendation === "major_revision"}
						onClick={() => updateField("recommendation", "major_revision")}
						color="orange"
					/>
					<RecommendationOption
						value="reject"
						label="Rejeitar"
						description="Não adequado para publicação"
						selected={formData.recommendation === "reject"}
						onClick={() => updateField("recommendation", "reject")}
						color="red"
					/>
				</div>
			</div>

			{/* Concerns Checklist */}
			<div className="p-6 border rounded-lg bg-card space-y-4">
				<h2 className="text-xl font-semibold">Preocupações Identificadas</h2>
				<p className="text-sm text-muted-foreground">
					Marque se identificou algum dos problemas abaixo:
				</p>
				<div className="space-y-3">
					<label className="flex items-center gap-3 cursor-pointer">
						<input
							type="checkbox"
							checked={formData.has_methodology_issues}
							onChange={(e) => updateField("has_methodology_issues", e.target.checked)}
							className="size-4 rounded"
						/>
						<div>
							<p className="font-medium">Problemas Metodológicos</p>
							<p className="text-xs text-muted-foreground">
								Falhas no desenho do estudo ou execução
							</p>
						</div>
					</label>

					<label className="flex items-center gap-3 cursor-pointer">
						<input
							type="checkbox"
							checked={formData.has_statistical_errors}
							onChange={(e) => updateField("has_statistical_errors", e.target.checked)}
							className="size-4 rounded"
						/>
						<div>
							<p className="font-medium">Erros Estatísticos</p>
							<p className="text-xs text-muted-foreground">
								Análises estatísticas incorretas ou inadequadas
							</p>
						</div>
					</label>

					<label className="flex items-center gap-3 cursor-pointer">
						<input
							type="checkbox"
							checked={formData.has_ethical_concerns}
							onChange={(e) => updateField("has_ethical_concerns", e.target.checked)}
							className="size-4 rounded"
						/>
						<div>
							<p className="font-medium">Preocupações Éticas</p>
							<p className="text-xs text-muted-foreground">
								Questões relacionadas à ética em pesquisa
							</p>
						</div>
					</label>

					<label className="flex items-center gap-3 cursor-pointer">
						<input
							type="checkbox"
							checked={formData.suspected_plagiarism}
							onChange={(e) => updateField("suspected_plagiarism", e.target.checked)}
							className="size-4 rounded"
						/>
						<div>
							<p className="font-medium">Suspeita de Plágio</p>
							<p className="text-xs text-muted-foreground">
								Possível plágio ou auto-plágio identificado
							</p>
						</div>
					</label>
				</div>
			</div>

			{/* Actions */}
			<div className="flex gap-3 justify-end sticky bottom-4 p-4 border rounded-lg bg-card shadow-lg">
				<Button variant="outline" onClick={handleSaveDraft} disabled={isSaving || isSubmitting}>
					<Save className="size-4 mr-2" />
					{isSaving ? "Salvando..." : "Salvar Rascunho"}
				</Button>
				<Button onClick={handleSubmit} disabled={isSaving || isSubmitting}>
					<Send className="size-4 mr-2" />
					{isSubmitting ? "Submetendo..." : "Submeter Revisão"}
				</Button>
			</div>
		</div>
	)
}

function ScoreInput({
	label,
	value,
	onChange,
	highlight = false,
}: {
	label: string
	value: number
	onChange: (value: number) => void
	highlight?: boolean
}) {
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
							value === score
								? "bg-primary text-primary-foreground border-primary"
								: "bg-background hover:bg-muted"
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
	value: string
	label: string
	description: string
	selected: boolean
	onClick: () => void
	color: "green" | "blue" | "orange" | "red"
}) {
	const colorClasses = {
		green: selected
			? "border-green-500 bg-green-50 dark:bg-green-950"
			: "border-gray-200 hover:border-green-300",
		blue: selected
			? "border-blue-500 bg-blue-50 dark:bg-blue-950"
			: "border-gray-200 hover:border-blue-300",
		orange: selected
			? "border-orange-500 bg-orange-50 dark:bg-orange-950"
			: "border-gray-200 hover:border-orange-300",
		red: selected
			? "border-red-500 bg-red-50 dark:bg-red-950"
			: "border-gray-200 hover:border-red-300",
	}

	return (
		<button
			type="button"
			onClick={onClick}
			className={`p-4 border-2 rounded-lg text-left transition-colors ${colorClasses[color]}`}
		>
			<p className="font-semibold mb-1">{label}</p>
			<p className="text-xs text-muted-foreground">{description}</p>
		</button>
	)
}
