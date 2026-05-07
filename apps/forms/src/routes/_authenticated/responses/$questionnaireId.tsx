import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { format } from "date-fns"
import { ArrowLeft, Trash } from "iconoir-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/useAuth"
import { addViewerFn, getQuestionnaireFn, getResponsesFn, getViewersFn, removeViewerFn } from "@/server/forms.fn"

const questionnaireQueryOptions = (id: string) =>
	queryOptions({
		queryKey: ["questionnaire", id],
		queryFn: () => getQuestionnaireFn({ data: { id } }),
	})

const responsesQueryOptions = (questionnaireId: string) =>
	queryOptions({
		queryKey: ["responses", questionnaireId],
		queryFn: () => getResponsesFn({ data: { questionnaire_id: questionnaireId } }),
	})

const viewersQueryOptions = (questionnaireId: string) =>
	queryOptions({
		queryKey: ["viewers", questionnaireId],
		queryFn: () => getViewersFn({ data: { questionnaire_id: questionnaireId } }),
	})

export const Route = createFileRoute("/_authenticated/responses/$questionnaireId")({
	loader: ({ context, params }) => {
		context.queryClient.ensureQueryData(questionnaireQueryOptions(params.questionnaireId))
		context.queryClient.ensureQueryData(viewersQueryOptions(params.questionnaireId))
		return context.queryClient.ensureQueryData(responsesQueryOptions(params.questionnaireId))
	},
	component: ResponsesPage,
})

function ResponsesPage() {
	const { questionnaireId } = Route.useParams()
	const navigate = useNavigate()
	const { user } = useAuth()
	const { data: questionnaire } = useSuspenseQuery(questionnaireQueryOptions(questionnaireId))
	const { data: responses } = useSuspenseQuery(responsesQueryOptions(questionnaireId))
	const { data: viewers } = useSuspenseQuery(viewersQueryOptions(questionnaireId))

	const allQuestions = (questionnaire.section ?? []).flatMap(
		(s: { question?: { id: string; text: string; type: string; options?: string[] | null }[] }) => s.question ?? []
	)
	const isCreator = questionnaire.created_by === user?.id

	return (
		<div className="p-6 md:p-10 space-y-6">
			<div className="flex items-center gap-3">
				<Button variant="ghost" size="sm" onClick={() => navigate({ to: "/responses" })}>
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<div>
					<h1 className="text-2xl font-bold tracking-tight">{questionnaire.title}</h1>
					<p className="text-sm text-muted-foreground mt-1">
						{responses?.length ?? 0} {(responses?.length ?? 0) === 1 ? "resposta" : "respostas"} recebidas
					</p>
				</div>
			</div>

			{isCreator && <ViewerManager questionnaireId={questionnaireId} viewers={viewers ?? []} />}

			<Tabs defaultValue="summary">
				<TabsList>
					<TabsTrigger value="summary">Resumo</TabsTrigger>
					<TabsTrigger value="individual">Individual</TabsTrigger>
				</TabsList>

				<TabsContent value="summary">
					{!responses || responses.length === 0 ? (
						<Card>
							<CardContent className="py-12 text-center">
								<p className="text-sm text-muted-foreground">Nenhuma resposta recebida ainda.</p>
							</CardContent>
						</Card>
					) : (
						<div className="space-y-4">
							{buildSummaries(allQuestions, responses).map((s) => (
								<QuestionSummaryCard key={s.id} summary={s} totalResponses={responses.length} />
							))}
						</div>
					)}
				</TabsContent>

				<TabsContent value="individual">
					{!responses || responses.length === 0 ? (
						<Card>
							<CardContent className="py-12 text-center">
								<p className="text-sm text-muted-foreground">Nenhuma resposta recebida ainda.</p>
							</CardContent>
						</Card>
					) : (
						<div className="space-y-6">
							{responses.map((qr, idx) => (
								<Card key={qr.id}>
									<CardHeader className="pb-3">
										<div className="flex items-center justify-between">
											<CardTitle className="text-base">Resposta #{idx + 1}</CardTitle>
											<div className="flex items-center gap-2">
												<Badge variant="secondary">{qr.respondent_id.slice(0, 8)}</Badge>
												{qr.submitted_at && <span className="text-xs text-muted-foreground">{format(new Date(qr.submitted_at), "dd/MM/yyyy HH:mm")}</span>}
											</div>
										</div>
									</CardHeader>
									<CardContent>
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Pergunta</TableHead>
													<TableHead>Resposta</TableHead>
													<TableHead>Observação</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{allQuestions.map((q: { id: string; text: string }) => {
													const answer = (qr.response ?? []).find((r: { question_id: string }) => r.question_id === q.id) as
														| { value: unknown; observation: string | null }
														| undefined
													return (
														<TableRow key={q.id}>
															<TableCell className="font-medium">{q.text}</TableCell>
															<TableCell>{answer ? formatValue(answer.value) : <span className="text-muted-foreground">—</span>}</TableCell>
															<TableCell className="text-sm text-muted-foreground">{answer?.observation || "—"}</TableCell>
														</TableRow>
													)
												})}
											</TableBody>
										</Table>
									</CardContent>
								</Card>
							))}
						</div>
					)}
				</TabsContent>
			</Tabs>
		</div>
	)
}

// ── Summary helpers ───────────────────────────────────────────────────────────

type Question = { id: string; text: string; type: string; options?: string[] | null }
type ResponseRow = {
	id: string
	respondent_id: string
	submitted_at: string | null
	response: Array<{ question_id: string; value: unknown; observation: string | null }> | null
}

function buildSummaries(questions: Question[], responses: ResponseRow[]) {
	return questions.map((q) => {
		const answers = responses
			.flatMap((r) => r.response ?? [])
			.filter((a) => a.question_id === q.id && a.value != null && a.value !== "")
			.map((a) => a.value)
		return { ...q, answers }
	})
}

type Summary = ReturnType<typeof buildSummaries>[number]

function QuestionSummaryCard({ summary, totalResponses }: { summary: Summary; totalResponses: number }) {
	const { text, type, options, answers } = summary

	let content: React.ReactNode

	if (type === "boolean") {
		const simCount = answers.filter((v) => v === true).length
		const naoCount = answers.filter((v) => v === false).length
		content = (
			<div className="space-y-2">
				<BarRow label="Sim" count={simCount} total={totalResponses} />
				<BarRow label="Não" count={naoCount} total={totalResponses} />
			</div>
		)
	} else if (type === "single_choice") {
		const opts = Array.isArray(options) ? (options as string[]) : []
		content = (
			<div className="space-y-2">
				{opts.map((opt) => (
					<BarRow key={opt} label={opt} count={answers.filter((v) => v === opt).length} total={totalResponses} />
				))}
			</div>
		)
	} else if (type === "multiple_choice") {
		const opts = Array.isArray(options) ? (options as string[]) : []
		const flat = answers.flatMap((v) => (Array.isArray(v) ? (v as string[]) : [String(v)]))
		content = (
			<div className="space-y-2">
				{opts.map((opt) => (
					<BarRow key={opt} label={opt} count={flat.filter((v) => v === opt).length} total={totalResponses} />
				))}
			</div>
		)
	} else if (type === "scale" || type === "number") {
		const nums = answers.map((v) => Number(v)).filter((n) => !Number.isNaN(n))
		if (nums.length === 0) {
			content = <p className="text-sm text-muted-foreground">Sem respostas numéricas.</p>
		} else {
			const avg = nums.reduce((a, b) => a + b, 0) / nums.length
			const min = Math.min(...nums)
			const max = Math.max(...nums)
			content = (
				<div className="flex gap-8 text-sm">
					<div>
						<p className="text-muted-foreground text-xs mb-0.5">Média</p>
						<p className="text-2xl font-semibold tabular-nums">{avg.toFixed(1)}</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs mb-0.5">Mín</p>
						<p className="text-2xl font-semibold tabular-nums">{min}</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs mb-0.5">Máx</p>
						<p className="text-2xl font-semibold tabular-nums">{max}</p>
					</div>
				</div>
			)
		}
	} else {
		content =
			answers.length === 0 ? (
				<p className="text-sm text-muted-foreground">Sem respostas.</p>
			) : (
				<ul className="space-y-1.5">
					{answers.map((v, i) => (
						<li key={i} className="text-sm border-l-2 border-muted pl-3 py-0.5 text-foreground">
							{String(v)}
						</li>
					))}
				</ul>
			)
	}

	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-start justify-between gap-3">
					<CardTitle className="text-base font-medium leading-snug">{text}</CardTitle>
					<Badge variant="secondary" className="shrink-0 tabular-nums">
						{answers.length}/{totalResponses}
					</Badge>
				</div>
			</CardHeader>
			<CardContent>{content}</CardContent>
		</Card>
	)
}

function BarRow({ label, count, total }: { label: string; count: number; total: number }) {
	const pct = total > 0 ? (count / total) * 100 : 0
	return (
		<div className="space-y-1">
			<div className="flex justify-between text-sm">
				<span>{label}</span>
				<span className="text-muted-foreground tabular-nums">
					{count} ({Math.round(pct)}%)
				</span>
			</div>
			<div className="h-2 bg-muted rounded-full overflow-hidden">
				<div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
			</div>
		</div>
	)
}

// ── Viewer Manager ────────────────────────────────────────────────────────────

type Viewer = { id: string; viewer_email: string; questionnaire_id: string }

function ViewerManager({ questionnaireId, viewers }: { questionnaireId: string; viewers: Viewer[] }) {
	const queryClient = useQueryClient()
	const [email, setEmail] = useState("")
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleAdd() {
		if (!email.trim()) return
		setLoading(true)
		setError(null)
		try {
			await addViewerFn({ data: { questionnaire_id: questionnaireId, email: email.trim() } })
			setEmail("")
			queryClient.invalidateQueries({ queryKey: ["viewers", questionnaireId] })
		} catch (e) {
			setError(e instanceof Error ? e.message : "Erro ao adicionar visualizador")
		} finally {
			setLoading(false)
		}
	}

	async function handleRemove(id: string) {
		try {
			await removeViewerFn({ data: { id, questionnaire_id: questionnaireId } })
			queryClient.invalidateQueries({ queryKey: ["viewers", questionnaireId] })
		} catch (e) {
			setError(e instanceof Error ? e.message : "Erro ao remover visualizador")
		}
	}

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Visualizadores</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex gap-2">
					<Input
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleAdd()}
						placeholder="email@fab.mil.br"
						className="max-w-sm"
					/>
					<Button onClick={handleAdd} disabled={loading || !email.trim()} size="sm">
						Adicionar
					</Button>
				</div>
				{error && <p className="text-sm text-destructive">{error}</p>}
				{viewers.length > 0 && (
					<ul className="space-y-1">
						{viewers.map((v) => (
							<li key={v.id} className="flex items-center justify-between rounded-md border px-3 py-2">
								<span className="text-sm">{v.viewer_email}</span>
								<Button variant="ghost" size="sm" onClick={() => handleRemove(v.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
									<Trash className="h-3.5 w-3.5" />
								</Button>
							</li>
						))}
					</ul>
				)}
				{viewers.length === 0 && <p className="text-sm text-muted-foreground">Nenhum visualizador adicionado.</p>}
			</CardContent>
		</Card>
	)
}

function formatValue(value: unknown): string {
	if (value == null) return "—"
	if (typeof value === "boolean") return value ? "Sim" : "Não"
	if (Array.isArray(value)) return value.join(", ")
	return String(value)
}
