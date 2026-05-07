import { queryOptions, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { format } from "date-fns"
import { ArrowLeft } from "iconoir-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getQuestionnaireFn, getResponsesFn } from "@/server/forms.fn"

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

export const Route = createFileRoute("/_authenticated/responses/$questionnaireId")({
	loader: ({ context, params }) => {
		context.queryClient.ensureQueryData(questionnaireQueryOptions(params.questionnaireId))
		return context.queryClient.ensureQueryData(responsesQueryOptions(params.questionnaireId))
	},
	component: ResponsesPage,
})

function ResponsesPage() {
	const { questionnaireId } = Route.useParams()
	const navigate = useNavigate()
	const { data: questionnaire } = useSuspenseQuery(questionnaireQueryOptions(questionnaireId))
	const { data: responses } = useSuspenseQuery(responsesQueryOptions(questionnaireId))

	const allQuestions = (questionnaire.section ?? []).flatMap((s: { question?: { id: string; text: string }[] }) => s.question ?? [])

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
		</div>
	)
}

function formatValue(value: unknown): string {
	if (value == null) return "—"
	if (typeof value === "boolean") return value ? "Sim" : "Não"
	if (Array.isArray(value)) return value.join(", ")
	return String(value)
}
