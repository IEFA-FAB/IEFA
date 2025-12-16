import {
	DndContext,
	DragEndEvent,
	DragOverlay,
	DragStartEvent,
	PointerSensor,
	useSensor,
	useSensors,
	type DragOverEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import { useUpdateArticle } from "@/lib/journal/hooks";
import type { EditorialDashboardArticle } from "@/lib/journal/types";
import { ArticleCard } from "./ArticleCard";
import { KanbanColumn } from "./KanbanColumn";

interface KanbanBoardProps {
	articles: EditorialDashboardArticle[];
}

const COLUMNS = [
	{ id: "submitted", title: "Submetido", status: "submitted" },
	{ id: "under_review", title: "Em Revisão", status: "under_review" },
	{
		id: "revision_requested",
		title: "Revisão Solicitada",
		status: "revision_requested",
	},
	{ id: "accepted", title: "Aceito", status: "accepted" },
	{ id: "published", title: "Publicado", status: "published" },
] as const;

export function KanbanBoard({ articles }: KanbanBoardProps) {
	const [activeId, setActiveId] = useState<string | null>(null);
	const updateArticle = useUpdateArticle();

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
	);

	const activeArticle = articles.find((a) => a.id === activeId);

	const getArticlesForColumn = (status: string) => {
		return articles.filter((article) => article.status === status);
	};

	const handleDragStart = (event: DragStartEvent) => {
		setActiveId(event.active.id as string);
	};

	const handleDragOver = (event: DragOverEvent) => {
		// Optional: Could add visual feedback here
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (!over) {
			setActiveId(null);
			return;
		}

		const articleId = active.id as string;
		const newStatus = over.id as string;

		const article = articles.find((a) => a.id === articleId);

		if (article && article.status !== newStatus) {
			// Optimistic update
			updateArticle.mutate({
				articleId,
				updates: { status: newStatus },
			});
		}

		setActiveId(null);
	};

	const handleDragCancel = () => {
		setActiveId(null);
	};

	return (
		<DndContext
			sensors={sensors}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
				{COLUMNS.map((column) => (
					<KanbanColumn
						key={column.id}
						id={column.status}
						title={column.title}
						articles={getArticlesForColumn(column.status)}
					/>
				))}
			</div>

			<DragOverlay>
				{activeArticle ? (
					<ArticleCard article={activeArticle} isDragging />
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
