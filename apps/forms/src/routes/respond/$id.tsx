import { queryOptions, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { format } from "date-fns"
import { Check, Refresh, SendDiagonal } from "iconoir-react"
import { useEffect, useMemo, useReducer } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAutoSave } from "@/hooks/useAutoSave"
import { EVALUATION_TYPES, type EvaluationType } from "@/lib/5s-constants"
import { CONFORMITY_OPTIONS, type ConformityOptions } from "@/lib/conformity"
import { assertUuidParam } from "@/lib/route-params"
import { getMyResponseStateFn, getOmOptionsFn, getOrCreateResponseSessionFn, getQuestionnaireFn, submitResponseFn } from "@/server/forms.fn"

const questionnaireQueryOptions = (id: string) =>
	queryOptions({
		queryKey: ["questionnaire", id],
		queryFn: () => getQuestionnaireFn({ data: { id } }),
	})

export const Route = createFileRoute("/respond/$id")({
	beforeLoad: ({ context, location, params }) => {
		assertUuidParam(params.id)
		if (!context.auth.isAuthenticated) {
			// location.href já vem serializado; interpolar location.search (objeto) lança TypeError
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
	},
	loader: ({ context, params }) => context.queryClient.ensureQueryData(questionnaireQueryOptions(params.id)),
	component: RespondPage,
})

type AnswerMap = Record<string, { value: unknown; observation: string | null }>
type ResponseViewState = "loading" | "metadata" | "draft" | "submitted"

type RespondState = {
	responseSessionId: string | null
	answers: AnswerMap
	submitting: boolean
	viewState: ResponseViewState
	submittedAt: string | null
	showObs: Record<string, boolean>
	currentVersion: number | null
}

type RespondAction =
	| { type: "INIT_DRAFT"; sessionId: string; answers: AnswerMap; version: number | null }
	| { type: "INIT_METADATA" }
	| { type: "SESSION_CREATED"; sessionId: string }
	| { type: "SET_ANSWER"; questionId: string; value: unknown }
	| { type: "TOGGLE_OBS"; questionId: string }
	| { type: "SET_OBS"; questionId: string; observation: string | null }
	| { type: "SUBMITTING" }
	| { type: "SUBMITTED"; submittedAt: string | null }
	| { type: "SUBMIT_FAILED" }
	| { type: "NEW_RESPONSE" }

const initialRespondState: RespondState = {
	responseSessionId: null,
	answers: {},
	submitting: false,
	viewState: "loading",
	submittedAt: null,
	showObs: {},
	currentVersion: null,
}

function respondReducer(state: RespondState, action: RespondAction): RespondState {
	switch (action.type) {
		case "INIT_DRAFT":
			return { ...state, responseSessionId: action.sessionId, answers: action.answers, currentVersion: action.version, viewState: "draft" }
		case "INIT_METADATA":
			return { ...state, viewState: "metadata" }
		case "SESSION_CREATED":
			return { ...state, responseSessionId: action.sessionId, answers: {}, viewState: "draft" }
		case "SET_ANSWER": {
			const existing = state.answers[action.questionId]
			return { ...state, answers: { ...state.answers, [action.questionId]: { value: action.value, observation: existing?.observation ?? null } } }
		}
		case "TOGGLE_OBS":
			return { ...state, showObs: { ...state.showObs, [action.questionId]: !state.showObs[action.questionId] } }
		case "SET_OBS": {
			const existing = state.answers[action.questionId]
			return { ...state, answers: { ...state.answers, [action.questionId]: { value: existing?.value ?? null, observation: action.observation } } }
		}
		case "SUBMITTING":
			return { ...state, submitting: true }
		case "SUBMITTED":
			return { ...state, submittedAt: action.submittedAt, viewState: "submitted", submitting: false }
		case "SUBMIT_FAILED":
			return { ...state, submitting: false }
		case "NEW_RESPONSE":
			return { ...state, viewState: "metadata" }
		default:
			return state
	}
}

type MetadataState = {
	evaluationType: EvaluationType | null
	om: string | null
	omCustom: string
	secao: string
	loading: boolean
	omOptions: { id: number; name: string }[]
}

type MetadataAction =
	| { type: "SET_EVALUATION_TYPE"; value: EvaluationType }
	| { type: "SET_OM"; value: string | null }
	| { type: "SET_OM_CUSTOM"; value: string }
	| { type: "SET_SECAO"; value: string }
	| { type: "SET_LOADING"; value: boolean }
	| { type: "SET_OM_OPTIONS"; options: { id: number; name: string }[] }

const initialMetadataState: MetadataState = {
	evaluationType: null,
	om: null,
	omCustom: "",
	secao: "",
	loading: false,
	omOptions: [],
}

function metadataReducer(state: MetadataState, action: MetadataAction): MetadataState {
	switch (action.type) {
		case "SET_EVALUATION_TYPE":
			return { ...state, evaluationType: action.value }
		case "SET_OM":
			return { ...state, om: action.value }
		case "SET_OM_CUSTOM":
			return { ...state, omCustom: action.value }
		case "SET_SECAO":
			return { ...state, secao: action.value }
		case "SET_LOADING":
			return { ...state, loading: action.value }
		case "SET_OM_OPTIONS":
			return { ...state, omOptions: action.options }
		default:
			return state
	}
}

function RespondPage() {
	const { id } = Route.useParams()
	const { data: questionnaire } = useSuspenseQuery(questionnaireQueryOptions(id))
	const [state, dispatch] = useReducer(respondReducer, initialRespondState)
	const { responseSessionId, answers, submitting, viewState, submittedAt, showObs, currentVersion } = state

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
			const responseState = await getMyResponseStateFn({ data: { questionnaire_id: id } })
			if (!isMounted) return

			if (responseState.status === "draft" && responseState.session) {
				dispatch({
					type: "INIT_DRAFT",
					sessionId: responseState.session.id,
					answers: buildAnswerMap(responseState.session.response),
					version: responseState.session.current_version ?? null,
				})
				return
			}

			dispatch({ type: "INIT_METADATA" })
		}

		init()

		return () => {
			isMounted = false
		}
	}, [id])

	const handleSubmit = async () => {
		if (!responseSessionId) return
		dispatch({ type: "SUBMITTING" })
		try {
			await flush()
			const submitted = await submitResponseFn({ data: { id: responseSessionId } })
			dispatch({ type: "SUBMITTED", submittedAt: submitted.submitted_at ?? null })
		} catch {
			dispatch({ type: "SUBMIT_FAILED" })
		}
	}

	if (questionnaire.status !== "sent") {
		return (
			<ResponseShell>
				<Card className="mx-auto max-w-xl">
					<CardContent className="py-16 text-center space-y-3">
						<h1 className="text-2xl font-semibold">Questionário indisponível</h1>
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
						<Refresh className="size-4 animate-spin" />
						Carregando questionário…
					</CardContent>
				</Card>
			</ResponseShell>
		)
	}

	if (viewState === "metadata") {
		return (
			<ResponseShell>
				<MetadataStep
					questionnaireId={id}
					questionnaireTitle={questionnaire.title}
					onSessionCreated={(session) => {
						dispatch({ type: "SESSION_CREATED", sessionId: session.id })
					}}
				/>
			</ResponseShell>
		)
	}

	if (viewState === "submitted") {
		return (
			<ResponseShell>
				<Card className="mx-auto max-w-xl">
					<CardContent className="py-16 text-center space-y-4">
						<Check className="size-12 mx-auto text-foreground" />
						<div className="space-y-1">
							<h1 className="text-2xl font-semibold">Resposta enviada</h1>
							<p className="text-sm text-muted-foreground">Sua resposta para {questionnaire.title} já foi registrada.</p>
						</div>
						{submittedAt && (
							<p className="text-xs text-muted-foreground" suppressHydrationWarning>
								Enviado em {format(new Date(submittedAt), "dd/MM/yyyy 'às' HH:mm")}
							</p>
						)}
						<div className="flex gap-3 justify-center">
							<Button variant="outline" onClick={() => dispatch({ type: "NEW_RESPONSE" })}>
								Nova resposta
							</Button>
							<Button nativeButton={false} variant="outline" render={<Link to="/dashboard" />}>
								Ir para o painel
							</Button>
						</div>
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
							<h1 className="text-2xl font-semibold tracking-tight">{questionnaire.title}</h1>
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

				{currentVersion != null && (
					<div className="mx-6 md:mx-8 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
						Você está editando a versão {currentVersion} desta resposta. Ao enviar, uma nova versão será criada.
					</div>
				)}

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
															const existing = answers[question.id]
															dispatch({ type: "SET_ANSWER", questionId: question.id, value })
															save(question.id, value, existing?.observation ?? null)
														}}
													/>

													<button
														type="button"
														className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
														onClick={() => dispatch({ type: "TOGGLE_OBS", questionId: question.id })}
													>
														Observação
													</button>
													{showObs[question.id] && (
														<Textarea
															placeholder="Explique sua resposta (opcional)"
															value={answer?.observation ?? ""}
															onChange={(event) => {
																const observation = event.target.value || null
																const existing = answers[question.id]
																dispatch({ type: "SET_OBS", questionId: question.id, observation })
																save(question.id, existing?.value ?? null, observation)
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
							{submitting ? <Refresh className="size-4 animate-spin" /> : <SendDiagonal className="size-4" />}
							Enviar respostas
						</Button>
					</div>
				</div>
			</div>
		</ResponseShell>
	)
}

function MetadataStep({
	questionnaireId,
	questionnaireTitle,
	onSessionCreated,
}: {
	questionnaireId: string
	questionnaireTitle: string
	onSessionCreated: (session: { id: string }) => void
}) {
	const [state, dispatch] = useReducer(metadataReducer, initialMetadataState)
	const { evaluationType, om, omCustom, secao, loading, omOptions } = state

	useEffect(() => {
		getOmOptionsFn({ data: {} }).then((options) => dispatch({ type: "SET_OM_OPTIONS", options }))
	}, [])

	const resolvedOm = om === "__outro" ? omCustom.trim() : (om ?? "")
	const canSubmit = evaluationType && resolvedOm && secao.trim()

	const handleStart = async () => {
		if (!canSubmit) return
		dispatch({ type: "SET_LOADING", value: true })
		try {
			const session = await getOrCreateResponseSessionFn({
				data: {
					questionnaire_id: questionnaireId,
					evaluation_type: evaluationType,
					om: resolvedOm,
					secao: secao.trim(),
				},
			})
			onSessionCreated(session)
		} finally {
			dispatch({ type: "SET_LOADING", value: false })
		}
	}

	return (
		<Card className="mx-auto max-w-xl">
			<CardHeader>
				<p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Formulários IEFA</p>
				<CardTitle className="text-xl">{questionnaireTitle}</CardTitle>
				<p className="text-sm text-muted-foreground">Preencha os dados abaixo antes de iniciar a avaliação.</p>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="space-y-3">
					<Label className="text-sm font-medium">Tipo de Avaliação</Label>
					<RadioGroup value={evaluationType ?? ""} onValueChange={(v) => dispatch({ type: "SET_EVALUATION_TYPE", value: v as EvaluationType })}>
						{EVALUATION_TYPES.map((t) => (
							<label key={t.value} htmlFor={`eval-type-${t.value}`} className="flex items-center gap-2.5 text-sm cursor-pointer">
								<RadioGroupItem id={`eval-type-${t.value}`} value={t.value} />
								{t.label}
							</label>
						))}
					</RadioGroup>
				</div>

				<div className="space-y-2">
					<Label className="text-sm font-medium">OM (Organização Militar)</Label>
					<Select value={om ?? null} onValueChange={(v) => dispatch({ type: "SET_OM", value: v })}>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Selecione a OM…">
								{om === "__outro" ? "Outro" : om ? (omOptions.find((o) => o.name === om)?.name ?? om) : undefined}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{omOptions.map((o) => (
								<SelectItem key={o.id} value={o.name}>
									{o.name}
								</SelectItem>
							))}
							<SelectItem value="__outro">Outro…</SelectItem>
						</SelectContent>
					</Select>
					{om === "__outro" && (
						<Input
							value={omCustom}
							onChange={(e) => dispatch({ type: "SET_OM_CUSTOM", value: e.target.value })}
							placeholder="Digite o nome da OM"
							className="mt-2"
						/>
					)}
				</div>

				<div className="space-y-2">
					<Label className="text-sm font-medium">Seção</Label>
					<Input value={secao} onChange={(e) => dispatch({ type: "SET_SECAO", value: e.target.value })} placeholder="Ex: Seção de Subsistência" />
				</div>

				<div className="pt-2">
					<Button onClick={handleStart} disabled={!canSubmit || loading} className="w-full">
						{loading ? <Refresh className="size-4 animate-spin" /> : null}
						Iniciar Avaliação
					</Button>
				</div>
			</CardContent>
		</Card>
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
		case "conformity": {
			const conformityOpts = question.options as ConformityOptions | null
			const weight = conformityOpts?.weight ?? 1
			const weightLabel = conformityOpts?.weightLabel ?? "Desejável"
			return (
				<div className="space-y-2">
					<div className="flex flex-wrap gap-2">
						{CONFORMITY_OPTIONS.map((opt) => (
							<Button
								key={opt.value}
								type="button"
								variant={value === opt.value ? "default" : "outline"}
								size="sm"
								onClick={() => onChange(opt.value)}
								className="min-w-[3.5rem]"
							>
								{opt.value}
							</Button>
						))}
					</div>
					<p className="text-xs text-muted-foreground">
						{value ? CONFORMITY_OPTIONS.find((o) => o.value === value)?.label : "Selecione uma opção"}
						{" · "}Peso {weight}: {weightLabel}
					</p>
				</div>
			)
		}
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
								className="size-4 accent-foreground"
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
									className="size-4 accent-foreground"
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
