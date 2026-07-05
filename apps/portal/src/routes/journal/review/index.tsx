import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Calendar, CheckCircle, Clock, Mail, Page, WarningCircle } from "iconoir-react"
import { authQueryOptions } from "@/auth/service"
import { Button } from "@/components/ui/button"
import type { ReviewerAssignment } from "@/lib/journal/client"
import { reviewerAssignmentsQueryOptions } from "@/lib/journal/hooks"

export const Route = createFileRoute("/journal/review/")({
	staticData: {
		nav: {
			title: "Painel do revisor",
			section: "Minha área",
			subtitle: "Gerenciar convites e revisões por pares",
			keywords: ["revisao", "revisor", "parecer", "peer review"],
			access: "authenticated",
			order: 110,
		},
	},
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions())
		if (!auth.isAuthenticated || !auth.user) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
		return { auth: auth as typeof auth & { user: NonNullable<typeof auth.user> } }
	},
	loader: async ({ context }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions())
		if (auth.user) {
			await context.queryClient.ensureQueryData(reviewerAssignmentsQueryOptions(auth.user.id))
		}
	},
	component: ReviewerDashboard,
})

function ReviewerDashboard() {
	const { auth } = Route.useRouteContext()
	const { data: assignments } = useSuspenseQuery(reviewerAssignmentsQueryOptions(auth.user.id))

	const invites = assignments.filter((a) => a.status === "invited")
	const pendingReviews = assignments.filter((a) => a.status === "accepted")
	const completedReviews = assignments.filter((a) => a.status === "completed")

	const nextDue = pendingReviews.map((a) => Math.ceil((new Date(a.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))).sort((a, b) => a - b)[0]

	return (
		<div className="space-y-6">
			{/* Header */}
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Painel do Revisor</h1>
				<p className="text-muted-foreground">Gerencie seus convites, revisões pendentes e concluídas</p>
			</div>

			{/* Stats */}
			<div className="grid sm:grid-cols-4 gap-4">
				<StatCard label="Convites" value={invites.length} icon={Mail} color="text-violet-500" />
				<StatCard label="Pendentes" value={pendingReviews.length} icon={Clock} color="text-orange-500" />
				<StatCard label="Concluídas" value={completedReviews.length} icon={CheckCircle} color="text-green-500" />
				<StatCard label="Próximo Prazo" value={nextDue !== undefined ? `${nextDue} dias` : "-"} icon={WarningCircle} color="text-blue-500" />
			</div>

			{/* Convites pendentes */}
			{invites.length > 0 && (
				<div className="space-y-4">
					<h2 className="text-xl font-semibold">Convites Pendentes</h2>
					<div className="space-y-3">
						{invites.map((a) => (
							<AssignmentCard key={a.id} assignment={a} variant="invite" />
						))}
					</div>
				</div>
			)}

			{/* Revisões a fazer */}
			<div className="space-y-4">
				<h2 className="text-xl font-semibold">Revisões Pendentes</h2>
				{pendingReviews.length > 0 ? (
					<div className="space-y-3">
						{pendingReviews.map((a) => (
							<AssignmentCard key={a.id} assignment={a} variant="pending" />
						))}
					</div>
				) : (
					<EmptyState icon={Clock} title="Nenhuma revisão pendente" description="Você não tem revisões aguardando no momento." />
				)}
			</div>

			{/* Revisões concluídas */}
			<div className="space-y-4">
				<h2 className="text-xl font-semibold">Revisões Concluídas</h2>
				{completedReviews.length > 0 ? (
					<div className="space-y-3">
						{completedReviews.map((a) => (
							<AssignmentCard key={a.id} assignment={a} variant="completed" />
						))}
					</div>
				) : (
					<EmptyState icon={CheckCircle} title="Nenhuma revisão concluída" description="Suas revisões concluídas aparecerão aqui." />
				)}
			</div>
		</div>
	)
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: typeof Clock; color: string }) {
	return (
		<div className="p-4 border rounded-lg bg-card">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm text-muted-foreground">{label}</p>
					<p className="text-2xl font-bold">{value}</p>
				</div>
				<Icon className={`size-8 ${color}`} />
			</div>
		</div>
	)
}

function AssignmentCard({ assignment, variant }: { assignment: ReviewerAssignment; variant: "invite" | "pending" | "completed" }) {
	const title = assignment.article?.title_pt ?? "Artigo"
	const daysUntilDue = Math.ceil((new Date(assignment.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

	return (
		<div className="p-6 border rounded-lg bg-card hover:border-primary transition-colors">
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1 space-y-3">
					<div className="flex items-center gap-2">
						{assignment.article?.submission_number && <span className="text-xs font-mono text-muted-foreground">#{assignment.article.submission_number}</span>}
						<h3 className="font-semibold text-lg line-clamp-2">{title}</h3>
					</div>

					<div className="flex flex-wrap gap-4 text-sm">
						<div className="flex items-center gap-2 text-muted-foreground">
							<Calendar className="size-4" />
							{variant === "completed" ? (
								<span>Concluída em {assignment.completed_at ? new Date(assignment.completed_at).toLocaleDateString("pt-BR") : "-"}</span>
							) : (
								<span>Prazo: {new Date(assignment.due_date).toLocaleDateString("pt-BR")}</span>
							)}
						</div>

						{variant === "pending" && (
							<div className="flex items-center gap-2">
								{daysUntilDue <= 3 ? (
									<span className="px-2 py-1 bg-destructive/10 text-destructive rounded text-xs font-medium">Prazo próximo: {daysUntilDue} dias</span>
								) : (
									<span className="px-2 py-1 bg-muted rounded text-xs">{daysUntilDue} dias restantes</span>
								)}
							</div>
						)}
						{variant === "invite" && (
							<span className="px-2 py-1 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded text-xs font-medium">Aguardando resposta</span>
						)}
					</div>
				</div>

				<div className="flex flex-col gap-2">
					{variant === "invite" ? (
						<Button
							nativeButton={false}
							render={
								<Link to="/journal/review/$token" params={{ token: assignment.invitation_token }}>
									<Mail className="size-4 mr-2" />
									Responder Convite
								</Link>
							}
						/>
					) : variant === "pending" ? (
						<Button
							nativeButton={false}
							render={
								<Link to="/journal/review/assignment/$assignmentId" params={{ assignmentId: assignment.id }}>
									<Page className="size-4 mr-2" />
									Realizar Revisão
								</Link>
							}
						/>
					) : (
						<Button
							nativeButton={false}
							variant="outline"
							render={
								<Link to="/journal/review/assignment/$assignmentId" params={{ assignmentId: assignment.id }}>
									Ver Revisão
								</Link>
							}
						/>
					)}
				</div>
			</div>
		</div>
	)
}

function EmptyState({
	icon: Icon,
	title,
	description,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: Icon component type is loose
	icon: any
	title: string
	description: string
}) {
	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 text-center border rounded-lg bg-card">
			<div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
				<Icon className="size-6 text-muted-foreground" />
			</div>
			<h3 className="font-semibold mb-1">{title}</h3>
			<p className="text-sm text-muted-foreground">{description}</p>
		</div>
	)
}
