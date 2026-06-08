import { GitFork, Loader2, RotateCcw, Trash2, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { type BulkSelectedRecipe, useBulkRecipeOps } from "@/hooks/business/useBulkRecipeOps"

interface RecipesBulkActionsBarProps {
	selectedRecipes: BulkSelectedRecipe[]
	/** Cozinha atual (null = página global SDAB, fork local indisponível). */
	kitchenId: number | null
	/** Quando true (visualizando excluídas), oferece a ação Restaurar. */
	showDeleted?: boolean
	onDone: () => void
	onClear: () => void
}

export function RecipesBulkActionsBar({ selectedRecipes, kitchenId, showDeleted, onDone, onClear }: RecipesBulkActionsBarProps) {
	const { deleteRecipes, restoreRecipes, forkRecipes, isRunning, progress } = useBulkRecipeOps()
	const [confirmDelete, setConfirmDelete] = useState(false)

	const afterApply = (result: { done: number; failed: number }, verb: string) => {
		if (result.failed > 0) toast.warning(`${result.done} ${verb}, ${result.failed} falharam`)
		else toast.success(`${result.done} ${result.done === 1 ? "preparação" : "preparações"} ${verb}`)
		setConfirmDelete(false)
		onDone()
	}

	// Fork local só faz sentido para receitas globais (sem kitchen_id próprio).
	const forkTargets = selectedRecipes.filter((r) => r.kitchenId == null)

	const handleFork = async () => {
		if (kitchenId == null || forkTargets.length === 0) return
		const result = await forkRecipes(forkTargets, kitchenId)
		afterApply(result, "copiadas")
	}

	const handleDelete = async () => {
		const result = await deleteRecipes(selectedRecipes)
		afterApply(result, "excluídas")
	}

	const handleRestore = async () => {
		const result = await restoreRecipes(selectedRecipes)
		afterApply(result, "restauradas")
	}

	return (
		<>
			{/* Barra flutuante */}
			<div className="sticky bottom-4 z-30 mx-auto w-fit max-w-full">
				<div className="flex flex-wrap items-center gap-2 rounded-full border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
					<Badge variant="secondary" className="gap-1">
						{selectedRecipes.length} {selectedRecipes.length === 1 ? "selecionada" : "selecionadas"}
					</Badge>

					<div className="mx-1 h-5 w-px bg-border" />

					{kitchenId != null && (
						<Button variant="ghost" size="sm" className="gap-1.5" disabled={forkTargets.length === 0 || isRunning} onClick={handleFork}>
							{isRunning ? <Loader2 className="size-4 animate-spin" /> : <GitFork className="size-4" />}
							Copiar local
						</Button>
					)}
					{showDeleted && (
						<Button variant="ghost" size="sm" className="gap-1.5" disabled={selectedRecipes.length === 0 || isRunning} onClick={handleRestore}>
							{isRunning ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
							Restaurar
						</Button>
					)}
					<Button
						variant="ghost"
						size="sm"
						className="gap-1.5 text-destructive hover:text-destructive"
						disabled={selectedRecipes.length === 0 || isRunning}
						onClick={() => setConfirmDelete(true)}
					>
						<Trash2 className="size-4" />
						Excluir
					</Button>

					<div className="mx-1 h-5 w-px bg-border" />

					<Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Limpar seleção">
						<X className="size-4" />
					</Button>
				</div>
			</div>

			{/* Excluir em lote */}
			<AlertDialog open={confirmDelete} onOpenChange={(o) => !o && !isRunning && setConfirmDelete(false)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Excluir {selectedRecipes.length} {selectedRecipes.length === 1 ? "preparação" : "preparações"}?
						</AlertDialogTitle>
						<AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isRunning}>Cancelar</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isRunning}>
							{isRunning && <Loader2 className="size-4 animate-spin" />}
							{isRunning && progress ? `${progress.completed}/${progress.total}` : "Excluir"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
