import { queryOptions, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, ClipboardCheck, EditPencil, Plus, SendDiagonal } from "iconoir-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/useAuth"
import { getQuestionnairesFn } from "@/server/forms.fn"

const questionnairesQueryOptions = () =>
	queryOptions({
		queryKey: ["questionnaires"],
		queryFn: () => getQuestionnairesFn(),
	})

export const Route = createFileRoute("/_authenticated/dashboard")({
	loader: ({ context }) => context.queryClient.ensureQueryData(questionnairesQueryOptions()),
	component: DashboardPage,
})

function DashboardPage() {
	const { user } = useAuth()
	const { data: questionnaires } = useSuspenseQuery(questionnairesQueryOptions())

	const myQuestionnaires = questionnaires?.filter((q) => q.created_by === user?.id) ?? []
	const sentQuestionnaires = questionnaires?.filter((q) => q.status === "sent") ?? []

	return (
		<div className="p-6 md:p-10 space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Painel</h1>
					<p className="text-sm text-muted-foreground mt-1">Gerencie questionários e responda pesquisas pendentes.</p>
				</div>
				<Button nativeButton={false} render={<Link to="/questionnaires/new" />}>
					<Plus className="h-4 w-4" />
					Novo Questionário
				</Button>
			</div>

			<Tabs defaultValue="my">
				<TabsList variant="line" className="border-b border-border bg-transparent">
					<TabsTrigger value="my">Meus Questionários</TabsTrigger>
					<TabsTrigger value="respond">Responder</TabsTrigger>
				</TabsList>

				<TabsContent value="my" className="mt-6">
					{myQuestionnaires.length === 0 ? (
						<Card>
							<CardContent className="py-12 text-center">
								<ClipboardCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
								<p className="text-sm text-muted-foreground">Nenhum questionário criado ainda.</p>
								<Button nativeButton={false} render={<Link to="/questionnaires/new" />} variant="outline" className="mt-4">
									<Plus className="h-4 w-4" />
									Criar primeiro questionário
								</Button>
							</CardContent>
						</Card>
					) : (
						<div className="space-y-3">
							{myQuestionnaires.map((q) => (
								<Link key={q.id} to="/questionnaires/$id" params={{ id: q.id }} className="block">
									<Card className="transition-colors hover:bg-accent/50">
										<CardHeader className="pb-3">
											<div className="flex items-center justify-between">
												<CardTitle className="text-base">{q.title}</CardTitle>
												<Badge variant={q.status === "sent" ? "default" : "secondary"}>
													{q.status === "sent" ? (
														<>
															<SendDiagonal className="h-3 w-3" />
															Enviado
														</>
													) : (
														<>
															<EditPencil className="h-3 w-3" />
															Rascunho
														</>
													)}
												</Badge>
											</div>
											{q.description && <CardDescription className="mt-1">{q.description}</CardDescription>}
										</CardHeader>
									</Card>
								</Link>
							))}
						</div>
					)}
				</TabsContent>

				<TabsContent value="respond" className="mt-6">
					{sentQuestionnaires.length === 0 ? (
						<Card>
							<CardContent className="py-12 text-center">
								<p className="text-sm text-muted-foreground">Nenhum questionário disponível para responder.</p>
							</CardContent>
						</Card>
					) : (
						<div className="space-y-3">
							{sentQuestionnaires.map((q) => (
								<Link key={q.id} to="/respond/$id" params={{ id: q.id }} className="block">
									<Card className="transition-colors hover:bg-accent/50">
										<CardHeader className="pb-3">
											<div className="flex items-center justify-between">
												<div>
													<CardTitle className="text-base">{q.title}</CardTitle>
													{q.description && <CardDescription className="mt-1">{q.description}</CardDescription>}
												</div>
												<ArrowRight className="h-4 w-4 text-muted-foreground" />
											</div>
										</CardHeader>
									</Card>
								</Link>
							))}
						</div>
					)}
				</TabsContent>
			</Tabs>
		</div>
	)
}
