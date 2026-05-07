import { queryOptions, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { format } from "date-fns"
import { Check, Refresh, SendDiagonal } from "iconoir-react"
import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { useAutoSave } from "@/hooks/useAutoSave"
import { getMyResponseStateFn, getOrCreateResponseSessionFn, getQuestionnaireFn, submitResponseFn } from "@/server/forms.fn"

const questionnaireQueryOptions = (id: string) =>
	queryOptions({
		queryKey: ["questionnaire", id],
		queryFn: () => getQuestionnaireFn({ data: { id } }),
	})

export const Route = createFileRoute("/respond/$id")({
	beforeLoad: ({ context, location }) => {
		if (!context.auth.isAuthenticated) {
			const redirectTarget = `${location.pathname}${location.search}${location.hash}`
			throw redirect({ to: "/auth", search: { redirect: redirectTarget } })
		}
	},
	loader: ({ context, params }) => context.queryClient.ensureQueryData(questionnaireQueryOptions(params.id)),
	component: RespondPage,
})

type AnswerMap = Record<string, { value: unknown; observation: string | null }>
type ResponseViewState = "loading" | "draft" | "submitted"

function RespondPage() {
	const { id } = Route.useParams()
	const { data: questionnaire } = useSuspenseQuery(questionnaireQueryOptions(id))
	const [responseSessionId, setResponseSessionId] = useState<string | null>(null)
	const [answers, setAnswers] = useState<AnswerMap>({})
	const [submitting, setSubmitting] = useState(false)
	const [viewState, setViewState] = useState<ResponseViewState>("loading")
	const [submittedAt, setSubmittedAt] = useState<string | null>(null)
	const [showObs, setShowObs] = useState<Record<string, boolean>>({})

	const { save, flush, status: saveStatus } = useAutoSave(viewState === "draft" ? responseSessionId : null)

	const allQuestions = useMemo(
		() =>
			(questionnaire.section ?? []).flatMap(
				(s: { question?: { id: string; text: string; description: string | null; type: string; options: unknown; required: boolean }[] }) => s.question ?? []
			),
		[questionnaire]
	)

	const totalQuestions = allQuestions.length
	const answeredCount = Object.keys(answers).filter((key) => answers[key]?.value != null && answers[key]?.value !== "").length
	const progressPct = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0

	useEffect(() => {
		let isMounted = true

		const init = async () => {
			const state = await getMyResponseStateFn({ data: { questionnaire_id: id } })
			if (!isMounted) return

			if (state.status === "submitted") {
				setSubmittedAt(state.session?.submitted_at ?? null)
				setViewState("submitted")
				return
			}

			if (state.status === "draft" && state.session) {
				setResponseSessionId(state.session.id)
				setAnswers(buildAnswerMap(state.session.response))
				setViewState("draft")
				return
			}

			const session = await getOrCreateResponseSessionFn({ data: { questionnaire_id: id } })
			if (!isMounted) return
			setResponseSessionId(session.id)
			setAnswers({})
			setViewState("draft")
		}

		init()

		return () => {
			isMounted = false
		}
	}, [id])

	const handleSubmit = async () => {
		if (!responseSessionId) return
		setSubmitting(true)
		try {
			await flush()
			const submitted = await submitResponseFn({ data: { id: responseSessionId } })
			setSubmittedAt(submitted.submitted_at ?? null)
			setViewState("submitted")
		} finally {
			setSubmitting(false)
		}
	}

	if (questionnaire.status !== "sent") {
		return (
			<ResponseShell>
				<Card className="mx-auto max-w-xl">
					<CardContent className="py-16 text-center space-y-3">
						<h1 className="text-2xl font-bold">Questionário indisponível</h1>
						<p className="text-sm text-muted-foreground">Este questionário ainda não foi publicado para respostas.</p>
						<Button nativeButton={false} render={<Link to="/dashboard" />}>
							Ir para o painel
						</Button>
					</CardContent>
				</Card>
			</ResponseShell>
		)
	}

	if (viewState === "loading") {
		return (
			<ResponseShell>
				<Card className="mx-auto max-w-xl">
					<CardContent className="py-16 flex items-center justify-center gap-3 text-sm text-muted-foreground">
						<Refresh className="h-4 w-4 animate-spin" />
						Carregando questionário...
					</CardContent>
				</Card>
			</ResponseShell>
		)
	}

	if (viewState === "submitted") {
		return (
			<ResponseShell>
				<Card className="mx-auto max-w-xl">
					<CardContent className="py-16 text-center space-y-4">
						<Check className="h-12 w-12 mx-auto text-foreground" />
						<div className="space-y-1">
							<h1 className="text-2xl font-bold">Resposta enviada</h1>
							<p className="text-sm text-muted-foreground">Sua resposta para {questionnaire.title} já foi registrada.</p>
						</div>
						{submittedAt && <p className="text-xs text-muted-foreground">Enviado em {format(new Date(submittedAt), "dd/MM/yyyy 'às' HH:mm")}</p>}
						<Button nativeButton={false} variant="outline" render={<Link to="/dashboard" />}>
							Ir para o painel
						</Button>
					</CardContent>
				</Card>
			</ResponseShell>
		)
	}

	return (
		<ResponseShell>
			<div className="space-y-6">
				<div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-4 space-y-3 md:px-8">
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-1">
							<p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Formulários IEFA</p>
							<h1 className="text-2xl font-bold tracking-tight">{questionnaire.title}</h1>
							{questionnaire.description && <p className="text-sm text-muted-foreground">{questionnaire.description}</p>}
						</div>
						<Badge variant="secondary" className="text-xs shrink-0">
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
				</div>

				<div className="px-6 pb-8 space-y-6 md:px-8">
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
													<QuestionInput
														question={question}
														value={answer?.value}
														onChange={(value) => {
															setAnswers((prev) => {
																const existing = prev[question.id]
																const updated = { ...prev, [question.id]: { value, observation: existing?.observation ?? null } }
																save(question.id, value, existing?.observation ?? null)
																return updated
															})
														}}
													/>

													<button
														type="button"
														className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
														onClick={() => setShowObs((prev) => ({ ...prev, [question.id]: !prev[question.id] }))}
													>
														Observação
													</button>
													{showObs[question.id] && (
														<Textarea
															placeholder="Explique sua resposta (opcional)"
															value={answer?.observation ?? ""}
															onChange={(event) => {
																const observation = event.target.value || null
																setAnswers((prev) => {
																	const existing = prev[question.id]
																	const updated = { ...prev, [question.id]: { value: existing?.value ?? null, observation } }
																	save(question.id, existing?.value ?? null, observation)
																	return updated
																})
															}}
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
			</div>
		</ResponseShell>
	)
}

function ResponseShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen bg-background">
			<div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col py-6">{children}</div>
		</div>
	)
}

function buildAnswerMap(responses: Array<{ question_id: string; value: unknown; observation: string | null }> | null | undefined): AnswerMap {
	const existing: AnswerMap = {}
	for (const response of responses ?? []) {
		existing[response.question_id] = { value: response.value, observation: response.observation }
	}
	return existing
}

function QuestionInput({
	question,
	value,
	onChange,
}: {
	question: { id: string; type: string; options?: unknown }
	value: unknown
	onChange: (value: unknown) => void
}) {
	const options = Array.isArray(question.options) ? (question.options as string[]) : []

	switch (question.type) {
		case "text":
			return <Input value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} />
		case "textarea":
			return <Textarea value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} rows={3} />
		case "number":
			return <Input type="number" value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} />
		case "date":
			return <Input type="date" value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} />
		case "boolean":
			return (
				<div className="flex gap-3">
					{[
						{ label: "Sim", value: true },
						{ label: "Não", value: false },
					].map((option) => (
						<Button key={option.label} type="button" variant={value === option.value ? "default" : "outline"} size="sm" onClick={() => onChange(option.value)}>
							{option.label}
						</Button>
					))}
				</div>
			)
		case "scale":
			return (
				<div className="flex gap-1">
					{[1, 2, 3, 4, 5].map((number) => (
						<Button key={number} type="button" variant={value === number ? "default" : "outline"} size="sm" className="w-10" onClick={() => onChange(number)}>
							{number}
						</Button>
					))}
				</div>
			)
		case "single_choice":
			return (
				<div className="space-y-2">
					{options.map((option) => (
						<label key={option} className="flex items-center gap-2 text-sm cursor-pointer">
							<input
								type="radio"
								name={`question-${question.id}`}
								checked={value === option}
								onChange={() => onChange(option)}
								className="h-4 w-4 accent-foreground"
							/>
							{option}
						</label>
					))}
				</div>
			)
		case "multiple_choice": {
			const selected = Array.isArray(value) ? (value as string[]) : []
			return (
				<div className="space-y-2">
					{options.map((option) => {
						const checked = selected.includes(option)
						return (
							<label key={option} className="flex items-center gap-2 text-sm cursor-pointer">
								<input
									type="checkbox"
									checked={checked}
									onChange={() => onChange(checked ? selected.filter((item) => item !== option) : [...selected, option])}
									className="h-4 w-4 accent-foreground"
								/>
								{option}
							</label>
						)
					})}
				</div>
			)
		}
		default:
			return <Input value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} />
	}
}
