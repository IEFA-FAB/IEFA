import { queryOptions, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, List } from "iconoir-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/hooks/useAuth"
import { getQuestionnairesFn, getSharedWithMeFn } from "@/server/forms.fn"

const questionnairesQueryOptions = () =>
	queryOptions({
		queryKey: ["questionnaires"],
		queryFn: () => getQuestionnairesFn(),
	})

const sharedQueryOptions = () =>
	queryOptions({
		queryKey: ["shared-with-me"],
		queryFn: () => getSharedWithMeFn(),
	})

export const Route = createFileRoute("/_authenticated/responses/")({
	loader: ({ context }) => {
		context.queryClient.ensureQueryData(questionnairesQueryOptions())
		return context.queryClient.ensureQueryData(sharedQueryOptions())
	},
	component: ResponsesIndexPage,
})

function ResponsesIndexPage() {
	const { user } = useAuth()
	const { data: questionnaires } = useSuspenseQuery(questionnairesQueryOptions())
	const { data: sharedQuestionnaires } = useSuspenseQuery(sharedQueryOptions())

	const myQuestionnaires = questionnaires?.filter((q) => q.created_by === user?.id) ?? []
	const sentQuestionnaires = myQuestionnaires.filter((q) => q.status === "sent")
	const shared = (sharedQuestionnaires ?? []).filter((q) => q.status === "sent")

	return (
		<div className="p-6 md:p-10 space-y-8">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Respostas</h1>
				<p className="text-sm text-muted-foreground mt-1">Selecione um questionário para visualizar as respostas recebidas.</p>
			</div>

			<section className="space-y-3">
				<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Meus questionários</h2>
				{sentQuestionnaires.length === 0 ? (
					<Card>
						<CardContent className="py-12 text-center">
							<List className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
							<p className="text-sm text-muted-foreground">Nenhum questionário enviado ainda.</p>
							<p className="text-xs text-muted-foreground mt-1">Publique um questionário para começar a receber respostas.</p>
						</CardContent>
					</Card>
				) : (
					<QuestionnaireList questionnaires={sentQuestionnaires} />
				)}
			</section>

			{shared.length > 0 && (
				<section className="space-y-3">
					<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Compartilhados comigo</h2>
					<QuestionnaireList questionnaires={shared} />
				</section>
			)}
		</div>
	)
}

function QuestionnaireList({ questionnaires }: { questionnaires: Array<{ id: string; title: string; description?: string | null; status: string }> }) {
	return (
		<div className="space-y-3">
			{questionnaires.map((q) => (
				<Link key={q.id} to="/responses/$questionnaireId" params={{ questionnaireId: q.id }} className="block">
					<Card className="transition-colors hover:bg-accent/50">
						<CardHeader className="pb-3">
							<div className="flex items-center justify-between">
								<div>
									<CardTitle className="text-base">{q.title}</CardTitle>
									{q.description && <CardDescription className="mt-1">{q.description}</CardDescription>}
								</div>
								<div className="flex items-center gap-3">
									<Badge variant="secondary">Enviado</Badge>
									<ArrowRight className="h-4 w-4 text-muted-foreground" />
								</div>
							</div>
						</CardHeader>
					</Card>
				</Link>
			))}
		</div>
	)
}
