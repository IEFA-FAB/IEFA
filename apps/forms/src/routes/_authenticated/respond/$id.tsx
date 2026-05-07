import { queryOptions, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Check, NavArrowDown, Refresh, SendDiagonal } from "iconoir-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { useAutoSave } from "@/hooks/useAutoSave"
import { getDraftResponseFn, getOrCreateResponseSessionFn, getQuestionnaireFn, submitResponseFn } from "@/server/forms.fn"

const questionnaireQueryOptions = (id: string) =>
	queryOptions({
		queryKey: ["questionnaire", id],
		queryFn: () => getQuestionnaireFn({ data: { id } }),
	})

export const Route = createFileRoute("/_authenticated/respond/$id")({
	loader: ({ context, params }) => context.queryClient.ensureQueryData(questionnaireQueryOptions(params.id)),
	component: RespondPage,
})

type AnswerMap = Record<string, { value: unknown; observation: string | null }>

function RespondPage() {
	const { id } = Route.useParams()
	const navigate = useNavigate()
	const { data: questionnaire } = useSuspenseQuery(questionnaireQueryOptions(id))
	const [responseSessionId, setResponseSessionId] = useState<string | null>(null)
	const [answers, setAnswers] = useState<AnswerMap>({})
	const [submitting, setSubmitting] = useState(false)
	const [submitted, setSubmitted] = useState(false)
	const [showObs, setShowObs] = useState<Record<string, boolean>>({})

	const { save, flush, status: saveStatus } = useAutoSave(responseSessionId)

	const allQuestions = useMemo(
		() =>
			(questionnaire.section ?? []).flatMap(
				(s: { question?: { id: string; text: string; description: string | null; type: string; options: unknown; required: boolean }[] }) => s.question ?? []
			),
		[questionnaire]
	)

	const totalQuestions = allQuestions.length
	const answeredCount = Object.keys(answers).filter((k) => answers[k]?.value != null && answers[k]?.value !== "").length
	const progressPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0

	useEffect(() => {
		const init = async () => {
			const session = await getOrCreateResponseSessionFn({ data: { questionnaire_id: id } })
			setResponseSessionId(session.id)

			const draft = await getDraftResponseFn({ data: { questionnaire_id: id } })
			if (draft?.response) {
				const existing: AnswerMap = {}
				for (const r of draft.response) {
					existing[r.question_id] = { value: r.value, observation: r.observation }
				}
				setAnswers(existing)
			}
		}
		init()
	}, [id])

	const handleAnswer = useCallback(
		(questionId: string, value: unknown) => {
			setAnswers((prev) => {
				const existing = prev[questionId]
				const updated = { ...prev, [questionId]: { value, observation: existing?.observation ?? null } }
				save(questionId, value, existing?.observation ?? null)
				return updated
			})
		},
		[save]
	)

	const handleObservation = useCallback(
		(questionId: string, observation: string) => {
			setAnswers((prev) => {
				const existing = prev[questionId]
				const obs = observation || null
				const updated = { ...prev, [questionId]: { value: existing?.value ?? null, observation: obs } }
				save(questionId, existing?.value ?? null, obs)
				return updated
			})
		},
		[save]
	)

	const handleSubmit = async () => {
		if (!responseSessionId) return
		setSubmitting(true)
		try {
			await flush()
			await submitResponseFn({ data: { id: responseSessionId } })
			setSubmitted(true)
		} finally {
			setSubmitting(false)
		}
	}

	if (submitted) {
		return (
			<div className="p-6 md:p-10 ">
				<Card>
					<CardContent className="py-16 text-center space-y-4">
						<Check className="h-12 w-12 mx-auto text-foreground" />
						<h2 className="text-xl font-bold">Resposta enviada!</h2>
						<p className="text-sm text-muted-foreground">Obrigado por responder o questionário.</p>
						<Button onClick={() => navigate({ to: "/" })}>Voltar ao painel</Button>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<div className="p-6 md:p-10  space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div>
						<h1 className="text-2xl font-bold tracking-tight">{questionnaire.title}</h1>
						{questionnaire.description && <p className="text-sm text-muted-foreground mt-1">{questionnaire.description}</p>}
					</div>
				</div>
				<Badge variant="secondary" className="text-xs">
					{saveStatus === "saving" && "Salvando..."}
					{saveStatus === "saved" && "Salvo"}
					{saveStatus === "error" && "Erro ao salvar"}
					{saveStatus === "idle" && "Auto-save ativo"}
				</Badge>
			</div>

			<div className="space-y-1">
				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span>Progresso</span>
					<span>{progressPct}%</span>
				</div>
				<Progress value={progressPct} />
			</div>

			{(questionnaire.section ?? []).map(
				(section: {
					id: string
					title: string
					description: string | null
					question?: { id: string; text: string; description: string | null; type: string; options: unknown; required: boolean }[]
				}) => (
					<Card key={section.id}>
						<CardHeader>
							<CardTitle>{section.title}</CardTitle>
							{section.description && <p className="text-sm text-muted-foreground">{section.description}</p>}
						</CardHeader>
						<CardContent className="space-y-6">
							{(section.question ?? []).map(
								(question: { id: string; text: string; description: string | null; type: string; options: unknown; required: boolean }) => {
									const answer = answers[question.id]
									return (
										<div key={question.id} className="space-y-2">
											<Label className="flex items-center gap-1">
												{question.text}
												{question.required && <span className="text-destructive">*</span>}
											</Label>
											{question.description && <p className="text-xs text-muted-foreground">{question.description}</p>}
											<QuestionInput question={question} value={answer?.value} onChange={(v) => handleAnswer(question.id, v)} />

											<button
												type="button"
												className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
												onClick={() => setShowObs((prev) => ({ ...prev, [question.id]: !prev[question.id] }))}
											>
												<NavArrowDown className={`h-3 w-3 transition-transform ${showObs[question.id] ? "rotate-180" : ""}`} />
												Observação
											</button>
											{showObs[question.id] && (
												<Textarea
													placeholder="Explique sua resposta (opcional)"
													value={answer?.observation ?? ""}
													onChange={(e) => handleObservation(question.id, e.target.value)}
													rows={2}
													className="text-sm"
												/>
											)}
										</div>
									)
								}
							)}
						</CardContent>
					</Card>
				)
			)}

			<div className="flex justify-end pt-4 border-t border-border">
				<Button onClick={handleSubmit} disabled={submitting}>
					{submitting ? <Refresh className="h-4 w-4 animate-spin" /> : <SendDiagonal className="h-4 w-4" />}
					Enviar respostas
				</Button>
			</div>
		</div>
	)
}

function QuestionInput({ question, value, onChange }: { question: { type: string; options?: unknown }; value: unknown; onChange: (v: unknown) => void }) {
	const options = Array.isArray(question.options) ? (question.options as string[]) : []

	switch (question.type) {
		case "text":
			return <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
		case "textarea":
			return <Textarea value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} rows={3} />
		case "number":
			return <Input type="number" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} />
		case "date":
			return <Input type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
		case "boolean":
			return (
				<div className="flex gap-3">
					{["Sim", "Não"].map((label) => (
						<Button key={label} variant={value === (label === "Sim") ? "default" : "outline"} size="sm" onClick={() => onChange(label === "Sim")}>
							{label}
						</Button>
					))}
				</div>
			)
		case "scale":
			return (
				<div className="flex gap-1">
					{[1, 2, 3, 4, 5].map((n) => (
						<Button key={n} variant={value === n ? "default" : "outline"} size="sm" className="w-10" onClick={() => onChange(n)}>
							{n}
						</Button>
					))}
				</div>
			)
		case "single_choice":
			return (
				<div className="space-y-2">
					{options.map((opt) => (
						<label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
							<input type="radio" name={`q-${question.type}`} checked={value === opt} onChange={() => onChange(opt)} className="h-4 w-4 accent-foreground" />
							{opt}
						</label>
					))}
				</div>
			)
		case "multiple_choice": {
			const selected = Array.isArray(value) ? (value as string[]) : []
			return (
				<div className="space-y-2">
					{options.map((opt) => (
						<label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
							<input
								type="checkbox"
								checked={selected.includes(opt)}
								onChange={(e) => {
									if (e.target.checked) onChange([...selected, opt])
									else onChange(selected.filter((s) => s !== opt))
								}}
								className="h-4 w-4 accent-foreground"
							/>
							{opt}
						</label>
					))}
				</div>
			)
		}
		default:
			return <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
	}
}
