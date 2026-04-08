import { CalendarX2, Loader2 } from "lucide-react"
import { useState } from "react"
import type { ProductionItem, ProductionTaskStatus } from "@/types/domain/production"
import { ProductionKanbanColumn } from "./ProductionKanbanColumn"
import { TaskDetailSheet } from "./TaskDetailSheet"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProductionBoardProps {
	items: ProductionItem[]
	isLoading: boolean
	onUpdateStatus: (taskId: string, status: ProductionTaskStatus, kitchenId: number, date: string) => void
	kitchenId: number
	date: string
	isUpdating?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const COLUMNS: ProductionTaskStatus[] = ["PENDING", "IN_PROGRESS", "DONE"]

export function ProductionBoard({ items, isLoading, onUpdateStatus, kitchenId, date, isUpdating }: ProductionBoardProps) {
	const [selectedItem, setSelectedItem] = useState<ProductionItem | null>(null)

	function handleUpdateStatus(taskId: string, status: ProductionTaskStatus) {
		onUpdateStatus(taskId, status, kitchenId, date)
		// Atualiza o item selecionado no sheet se for o mesmo
		if (selectedItem?.task.id === taskId) {
			setSelectedItem((prev) =>
				prev
					? {
							...prev,
							task: {
								...prev.task,
								status,
								started_at: status === "IN_PROGRESS" ? (prev.task.started_at ?? new Date().toISOString()) : status === "PENDING" ? null : prev.task.started_at,
								completed_at: status === "DONE" ? new Date().toISOString() : status === "PENDING" ? null : prev.task.completed_at,
							},
						}
					: null
			)
		}
	}

	// --- Loading state ---
	if (isLoading) {
		return (
			<div className="flex flex-1 items-center justify-center py-20">
				<div className="flex flex-col items-center gap-3 text-muted-foreground">
					<Loader2 className="h-8 w-8 animate-spin" />
					<p className="text-sm">Carregando painel de produção…</p>
				</div>
			</div>
		)
	}

	// --- Empty state (nenhum preparo planejado para hoje) ---
	if (items.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center py-20">
				<div className="flex flex-col items-center gap-3 text-center max-w-xs">
					<div className="rounded-full bg-muted p-4">
						<CalendarX2 className="h-8 w-8 text-muted-foreground" />
					</div>
					<p className="text-sm font-medium text-foreground">Nenhuma preparação planejada</p>
					<p className="text-xs text-muted-foreground">
						Não há itens no cardápio para esta data. Planeje as refeições no módulo de Planejamento para que apareçam aqui.
					</p>
				</div>
			</div>
		)
	}

	// --- Kanban board ---
	return (
		<>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3 flex-1 min-h-0">
				{COLUMNS.map((status) => (
					<ProductionKanbanColumn
						key={status}
						status={status}
						items={items.filter((i) => i.task.status === status)}
						onSelectItem={setSelectedItem}
						onUpdateStatus={handleUpdateStatus}
						isUpdating={isUpdating}
					/>
				))}
			</div>

			<TaskDetailSheet
				item={selectedItem}
				open={!!selectedItem}
				onOpenChange={(open) => {
					if (!open) setSelectedItem(null)
				}}
				onUpdateStatus={handleUpdateStatus}
				isUpdating={isUpdating}
			/>
		</>
	)
}
