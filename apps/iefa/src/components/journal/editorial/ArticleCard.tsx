import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@iefa/ui";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, Calendar, User } from "lucide-react";
import type { EditorialDashboardArticle } from "@/lib/journal/types";

interface ArticleCardProps {
	article: EditorialDashboardArticle;
	isDragging?: boolean;
}

export function ArticleCard({ article, isDragging = false }: ArticleCardProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging: isSortableDragging,
	} = useSortable({
		id: article.id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isSortableDragging ? 0.5 : 1,
	};

	const daysSinceSubmission = article.submitted_at
		? Math.floor(
				(Date.now() - new Date(article.submitted_at).getTime()) /
					(1000 * 60 * 60 * 24),
			)
		: 0;

	const getAgeColor = (days: number) => {
		if (days < 7)
			return "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300";
		if (days < 14)
			return "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300";
		return "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300";
	};

	return (
		<div ref={setNodeRef} style={style} {...attributes} {...listeners}>
			<Link
				to="/journal/editorial/articles/$articleId"
				params={{ articleId: article.id }}
				className="block"
			>
				<Card
					className={`hover:border-primary transition-colors cursor-grab active:cursor-grabbing ${
						isDragging ? "shadow-lg scale-105" : ""
					}`}
				>
					<CardContent className="p-4 space-y-3">
						{/* Age Badge */}
						<div className="flex items-center justify-between">
							<span className="text-xs font-mono text-muted-foreground">
								#{article.submission_number}
							</span>
							{daysSinceSubmission > 0 && (
								<span
									className={`text-xs px-2 py-0.5 rounded-full font-medium ${getAgeColor(daysSinceSubmission)}`}
								>
									{daysSinceSubmission}d
								</span>
							)}
						</div>

						{/* Title */}
						<h4 className="font-semibold text-sm line-clamp-2 leading-tight">
							{article.title_pt}
						</h4>

						{/* Metadata */}
						<div className="space-y-1.5 text-xs text-muted-foreground">
							<div className="flex items-center gap-1.5">
								<User className="size-3" aria-hidden="true" />
								<span className="truncate">{article.submitter_name}</span>
							</div>

							{article.submitted_at && (
								<div className="flex items-center gap-1.5">
									<Calendar className="size-3" aria-hidden="true" />
									<span>
										{formatDistanceToNow(new Date(article.submitted_at), {
											addSuffix: true,
											locale: ptBR,
										})}
									</span>
								</div>
							)}

							{article.review_count !== undefined &&
								article.review_count > 0 && (
									<div className="flex items-center gap-1.5">
										<AlertCircle className="size-3" aria-hidden="true" />
										<span>{article.review_count} revisões</span>
									</div>
								)}
						</div>

						{/* Article Type Badge */}
						<div className="pt-2 border-t">
							<span className="text-xs bg-muted px-2 py-1 rounded capitalize">
								{article.article_type === "research"
									? "Pesquisa"
									: article.article_type === "review"
										? "Revisão"
										: "Comunicação"}
							</span>
						</div>
					</CardContent>
				</Card>
			</Link>
		</div>
	);
}
