import { FolderInput, GitFork, Loader2, RotateCcw, Trash2, X } from "lucide-react"
import { useState } from "react"
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { type BulkSelectedRecipe, useBulkRecipeOps } from "@/hooks/business/useBulkRecipeOps"
import { useRecipeFolders } from "@/hooks/data/useRecipeFolders"

/** Sentinela do item "sem pasta" — o Select não aceita `null` como valor de item. */
const NO_FOLDER_VALUE = "__none__"

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
	const { deleteRecipes, restoreRecipes, forkRecipes, moveToFolder, isRunning, progress } = useBulkRecipeOps()
	const { folders } = useRecipeFolders()
	const [confirmDelete, setConfirmDelete] = useState(false)
	const [moveOpen, setMoveOpen] = useState(false)
	const [targetFolder, setTargetFolder] = useState<string | null>(null)

	const afterApply = (result: { done: number; failed: number }, verb: string) => {
		if (result.failed > 0) toast.warning(`${result.done} ${verb}, ${result.failed} falharam`)
		else toast.success(`${result.done} ${result.done === 1 ? "preparação" : "preparações"} ${verb}`)
		setConfirmDelete(false)
		setMoveOpen(false)
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

	const handleMove = async () => {
		if (targetFolder === null) return
		const result = await moveToFolder(selectedRecipes, targetFolder === NO_FOLDER_VALUE ? null : targetFolder)
		afterApply(result, targetFolder === NO_FOLDER_VALUE ? "tiradas da pasta" : "arquivadas")
	}

	const resolveFolderLabel = (value: string) => (value === NO_FOLDER_VALUE ? "Sem pasta" : (folders.find((f) => f.id === value)?.name ?? "Sem nome"))

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
					<Button
						variant="ghost"
						size="sm"
						className="gap-1.5"
						disabled={selectedRecipes.length === 0 || isRunning}
						onClick={() => {
							setTargetFolder(null)
							setMoveOpen(true)
						}}
					>
						<FolderInput className="size-4" />
						Pasta
					</Button>
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

			{/* Arquivar em pasta (agrupamento — não altera a ficha nem gera versão) */}
			<Dialog open={moveOpen} onOpenChange={(o) => !o && !isRunning && setMoveOpen(false)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Mover para pasta</DialogTitle>
						<DialogDescription>
							Agrupa {selectedRecipes.length} {selectedRecipes.length === 1 ? "preparação" : "preparações"} na pasta escolhida. A pasta serve só para organizar
							e filtrar a listagem — a ficha técnica não muda e nenhuma versão nova é criada.
						</DialogDescription>
					</DialogHeader>
					<Field>
						<FieldLabel>Pasta de destino</FieldLabel>
						<Select value={targetFolder} onValueChange={setTargetFolder}>
							<SelectTrigger>
								<SelectValue placeholder="Selecione a pasta">{targetFolder ? resolveFolderLabel(targetFolder) : undefined}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NO_FOLDER_VALUE}>Sem pasta</SelectItem>
								{folders.map((f) => (
									<SelectItem key={f.id} value={f.id}>
										{f.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<DialogFooter>
						<Button variant="outline" onClick={() => setMoveOpen(false)} disabled={isRunning}>
							Cancelar
						</Button>
						<Button onClick={handleMove} disabled={isRunning || targetFolder === null} className="gap-2">
							{isRunning && <Loader2 className="size-4 animate-spin" />}
							{isRunning && progress ? `${progress.completed}/${progress.total}` : "Mover"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

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
