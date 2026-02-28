import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import type { EditorialDashboardArticle } from "@/lib/journal/types"
import { ArticleCard } from "./ArticleCard"

interface KanbanColumnProps {
	id: string
	title: string
	articles: EditorialDashboardArticle[]
}

export function KanbanColumn({ id, title, articles }: KanbanColumnProps) {
	const { setNodeRef, isOver } = useDroppable({
		id,
	})

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between px-2">
				<h3 className="font-semibold text-sm">{title}</h3>
				<span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
					{articles.length}
				</span>
			</div>

			<div
				ref={setNodeRef}
				className={`min-h-[500px] rounded-lg border-2 border-dashed p-3 transition-colors ${
					isOver ? "border-primary bg-primary/5" : "border-muted bg-muted/20"
				}`}
			>
				<SortableContext items={articles.map((a) => a.id)} strategy={verticalListSortingStrategy}>
					<div className="space-y-3">
						{articles.map((article) => (
							<ArticleCard key={article.id} article={article} />
						))}
					</div>
				</SortableContext>

				{articles.length === 0 && (
					<div className="flex items-center justify-center h-full text-sm text-muted-foreground">
						Nenhum artigo
					</div>
				)}
			</div>
		</div>
	)
}
