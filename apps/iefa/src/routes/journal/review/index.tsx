import { Button } from "@iefa/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertCircle,
	Calendar,
	CheckCircle2,
	Clock,
	FileText,
} from "lucide-react";

export const Route = createFileRoute("/journal/review/")({
	component: ReviewerDashboard,
});

function ReviewerDashboard() {
	// Placeholder - will use reviewAssignmentsQueryOptions
	const assignments: any[] = [];

	const pendingReviews = assignments.filter((a) => a.status === "accepted");
	const completedReviews = assignments.filter((a) => a.status === "completed");

	return (
		<div className="space-y-6">
			{/* Header */}
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Painel do Revisor</h1>
				<p className="text-muted-foreground">
					Gerencie suas revisões pendentes e concluídas
				</p>
			</div>

			{/* Stats */}
			<div className="grid sm:grid-cols-3 gap-4">
				<div className="p-4 border rounded-lg bg-card">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-sm text-muted-foreground">Pendentes</p>
							<p className="text-2xl font-bold">{pendingReviews.length}</p>
						</div>
						<Clock className="size-8 text-orange-500" />
					</div>
				</div>
				<div className="p-4 border rounded-lg bg-card">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-sm text-muted-foreground">Concluídas</p>
							<p className="text-2xl font-bold">{completedReviews.length}</p>
						</div>
						<CheckCircle2 className="size-8 text-green-500" />
					</div>
				</div>
				<div className="p-4 border rounded-lg bg-card">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-sm text-muted-foreground">Próximo Prazo</p>
							<p className="text-2xl font-bold">
								{pendingReviews.length > 0 ? "5 dias" : "-"}
							</p>
						</div>
						<AlertCircle className="size-8 text-blue-500" />
					</div>
				</div>
			</div>

			{/* Pending Reviews */}
			<div className="space-y-4">
				<h2 className="text-xl font-semibold">Revisões Pendentes</h2>
				{pendingReviews.length > 0 ? (
					<div className="space-y-3">
						{pendingReviews.map((review) => (
							<ReviewCard key={review.id} assignment={review} isPending />
						))}
					</div>
				) : (
					<EmptyState
						icon={Clock}
						title="Nenhuma revisão pendente"
						description="Você não tem revisões aguardando no momento."
					/>
				)}
			</div>

			{/* Completed Reviews */}
			<div className="space-y-4">
				<h2 className="text-xl font-semibold">Revisões Concluídas</h2>
				{completedReviews.length > 0 ? (
					<div className="space-y-3">
						{completedReviews.map((review) => (
							<ReviewCard
								key={review.id}
								assignment={review}
								isPending={false}
							/>
						))}
					</div>
				) : (
					<EmptyState
						icon={CheckCircle2}
						title="Nenhuma revisão concluída"
						description="Suas revisões concluídas aparecerão aqui."
					/>
				)}
			</div>
		</div>
	);
}

interface ReviewCardProps {
	assignment: {
		id: string;
		article_title: string;
		due_date: string;
		invited_at: string;
		completed_at?: string;
	};
	isPending: boolean;
}

function ReviewCard({ assignment, isPending }: ReviewCardProps) {
	const daysUntilDue = Math.ceil(
		(new Date(assignment.due_date).getTime() - Date.now()) /
			(1000 * 60 * 60 * 24),
	);

	return (
		<div className="p-6 border rounded-lg bg-card hover:border-primary transition-colors">
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1 space-y-3">
					<div>
						<h3 className="font-semibold text-lg line-clamp-2">
							{assignment.article_title}
						</h3>
					</div>

					<div className="flex flex-wrap gap-4 text-sm">
						<div className="flex items-center gap-2 text-muted-foreground">
							<Calendar className="size-4" />
							{isPending ? (
								<span>
									Prazo:{" "}
									{new Date(assignment.due_date).toLocaleDateString("pt-BR")}
								</span>
							) : (
								<span>
									Concluída em{" "}
									{assignment.completed_at &&
										new Date(assignment.completed_at).toLocaleDateString(
											"pt-BR",
										)}
								</span>
							)}
						</div>

						{isPending && (
							<div className="flex items-center gap-2">
								{daysUntilDue <= 3 ? (
									<span className="px-2 py-1 bg-destructive/10 text-destructive rounded text-xs font-medium">
										Prazo próximo: {daysUntilDue} dias
									</span>
								) : (
									<span className="px-2 py-1 bg-muted rounded text-xs">
										{daysUntilDue} dias restantes
									</span>
								)}
							</div>
						)}
					</div>
				</div>

				<div className="flex flex-col gap-2">
					{isPending ? (
						<Button
							render={
								<Link
									to="/journal/review/$assignmentId"
									params={{ assignmentId: assignment.id }}
								>
									<FileText className="size-4 mr-2" />
									Realizar Revisão
								</Link>
							}
						/>
					) : (
						<Button
							render={
								<Link
									to="/journal/review/$assignmentId"
									params={{ assignmentId: assignment.id }}
								>
									Ver Revisão
								</Link>
							}
							variant="outline"
						/>
					)}
				</div>
			</div>
		</div>
	);
}

function EmptyState({
	icon: Icon,
	title,
	description,
}: {
	icon: any;
	title: string;
	description: string;
}) {
	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 text-center border rounded-lg bg-card">
			<div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
				<Icon className="size-6 text-muted-foreground" />
			</div>
			<h3 className="font-semibold mb-1">{title}</h3>
			<p className="text-sm text-muted-foreground">{description}</p>
		</div>
	);
}
