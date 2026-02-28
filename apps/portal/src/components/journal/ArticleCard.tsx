// Article card component for listing submissions

import { Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar, FileText } from "lucide-react"
import type { Article } from "@/lib/journal/types"
import { StatusBadge } from "./StatusBadge"

interface ArticleCardProps {
	article: Article
}

export function ArticleCard({ article }: ArticleCardProps) {
	return (
		<Link
			to="/journal/submissions/$id"
			params={{ id: article.id }}
			className="block p-4 border rounded-lg hover:border-primary transition-colors bg-card"
		>
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-2">
						<StatusBadge status={article.status} />
						<span className="text-xs text-muted-foreground">#{article.submission_number}</span>
					</div>

					<h3 className="font-medium text-lg mb-1 truncate">
						{article.title_en || article.title_pt}
					</h3>

					<p className="text-sm text-muted-foreground line-clamp-2 mb-3">
						{(article.abstract_en || article.abstract_pt || "").substring(0, 150)}
						...
					</p>

					<div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
						<div className="flex items-center gap-1">
							<FileText className="size-3" />
							<span className="capitalize">{article.article_type}</span>
						</div>

						<div className="flex items-center gap-1">
							<Calendar className="size-3" />
							<span>
								{article.submitted_at
									? format(new Date(article.submitted_at), "dd MMM yyyy", {
											locale: ptBR,
										})
									: "Rascunho"}
							</span>
						</div>

						{article.subject_area && (
							<div className="flex items-center gap-1">
								<span>{article.subject_area}</span>
							</div>
						)}
					</div>
				</div>
			</div>
		</Link>
	)
}
