import { queryOptions, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, ClipboardCheck, EditPencil, Plus, SendDiagonal } from "iconoir-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { env } from "@/env"
import { useAuth } from "@/hooks/useAuth"
import { questionnairesQueryOptions, useQuestionnaires } from "@/hooks/useQuestionnaires"
import { TENANTS, useTenant } from "@/lib/tenant"
import { getEditableSharedWithMeFn } from "@/server/forms.fn"

type QuestionnaireListItem = {
	id: string
	title: string
	description?: string | null
	status: string
	created_by?: string | null
	tags?: string[]
}

const editableSharedQueryOptions = (tags?: string[] | null) =>
	queryOptions({
		queryKey: ["editable-shared-with-me", tags ?? null],
		queryFn: () => getEditableSharedWithMeFn({ data: { tags: tags ?? undefined } }),
	})

export const Route = createFileRoute("/_authenticated/dashboard")({
	loader: ({ context }) => {
		const { tagFilter } = TENANTS[env.VITE_APP_TENANT]
		context.queryClient.ensureQueryData(questionnairesQueryOptions(tagFilter))
		return context.queryClient.ensureQueryData(editableSharedQueryOptions(tagFilter))
	},
	component: DashboardPage,
})

function DashboardPage() {
	const { user } = useAuth()
	const tenant = useTenant()
	const { data: questionnaires } = useQuestionnaires()
	const { data: editableSharedQuestionnaires } = useSuspenseQuery(editableSharedQueryOptions(tenant.tagFilter))

	const isCincoS = tenant.id === "cinco-s"
	const myQuestionnaires = questionnaires?.filter((q) => q.created_by === user?.id) ?? []
	const sentQuestionnaires = questionnaires?.filter((q) => q.status === "sent") ?? []
	const sharedEditable = editableSharedQuestionnaires ?? []

	return (
		<div className="p-6 md:p-10 space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Painel</h1>
					<p className="text-sm text-muted-foreground mt-1">
						{isCincoS ? "Gerencie checklists do Programa VETOR 5S." : "Gerencie questionários e responda pesquisas pendentes."}
					</p>
				</div>
				<Button nativeButton={false} render={<Link to="/questionnaires/new" />}>
					<Plus className="h-4 w-4" />
					{isCincoS ? "Novo Checklist 5S" : "Novo Questionário"}
				</Button>
			</div>

			<Tabs defaultValue="my">
				<TabsList variant="line" className="border-b border-border bg-transparent">
					<TabsTrigger value="my">{isCincoS ? "Meus Checklists" : "Meus Questionários"}</TabsTrigger>
					<TabsTrigger value="respond">Responder</TabsTrigger>
				</TabsList>

				<TabsContent value="my" className="mt-6 space-y-6">
					{myQuestionnaires.length === 0 && sharedEditable.length === 0 ? (
						<Card>
							<CardContent className="py-12 text-center">
								<ClipboardCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
								<p className="text-sm text-muted-foreground">{isCincoS ? "Nenhum checklist criado ainda." : "Nenhum questionário criado ainda."}</p>
								<Button nativeButton={false} render={<Link to="/questionnaires/new" />} variant="outline" className="mt-4">
									<Plus className="h-4 w-4" />
									{isCincoS ? "Criar primeiro checklist" : "Criar primeiro questionário"}
								</Button>
							</CardContent>
						</Card>
					) : (
						<>
							<section className="space-y-3">
								<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{isCincoS ? "Meus Checklists" : "Meus Questionários"}</h2>
								{myQuestionnaires.length > 0 ? (
									<QuestionnaireList questionnaires={myQuestionnaires} tenantId={tenant.id} />
								) : (
									<Card>
										<CardContent className="py-8 text-center">
											<p className="text-sm text-muted-foreground">
												{isCincoS ? "Você ainda não criou checklists próprios." : "Você ainda não criou questionários próprios."}
											</p>
										</CardContent>
									</Card>
								)}
							</section>

							{sharedEditable.length > 0 && (
								<section className="space-y-3">
									<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Compartilhados comigo</h2>
									<QuestionnaireList questionnaires={sharedEditable} tenantId={tenant.id} roleBadge="Editor" />
								</section>
							)}
						</>
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

function QuestionnaireList({
	questionnaires,
	tenantId,
	roleBadge,
}: {
	questionnaires: QuestionnaireListItem[]
	tenantId: "forms" | "cinco-s"
	roleBadge?: string
}) {
	return (
		<div className="space-y-3">
			{questionnaires.map((q) => (
				<Link key={q.id} to="/questionnaires/$id" params={{ id: q.id }} className="block">
					<Card className="transition-colors hover:bg-accent/50">
						<CardHeader className="pb-3">
							<div className="flex items-center justify-between gap-3">
								<div className="flex items-center gap-2">
									<CardTitle className="text-base">{q.title}</CardTitle>
									{tenantId === "forms" && q.tags?.includes("5s") && (
										<Badge variant="outline" className="text-xs shrink-0">
											5S
										</Badge>
									)}
								</div>
								<div className="flex items-center gap-2">
									{roleBadge && (
										<Badge variant="outline" className="text-xs shrink-0">
											{roleBadge}
										</Badge>
									)}
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
							</div>
							{q.description && <CardDescription className="mt-1">{q.description}</CardDescription>}
						</CardHeader>
					</Card>
				</Link>
			))}
		</div>
	)
}
