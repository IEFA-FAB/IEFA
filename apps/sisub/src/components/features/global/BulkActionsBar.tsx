import { FolderInput, Loader2, Ruler, Scale, Trash2, X } from "lucide-react"
import { useId, useMemo, useState } from "react"
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type BulkSelectedNode, useBulkIngredientOps } from "@/hooks/business/useBulkIngredientOps"
import { useFolders } from "@/services/IngredientsService"

const MEASURE_UNITS: { value: string; label: string }[] = [
	{ value: "UN", label: "UN (Unidade)" },
	{ value: "KG", label: "KG (Quilograma)" },
	{ value: "LT", label: "LT (Litro)" },
	{ value: "G", label: "G (Grama)" },
	{ value: "ML", label: "ML (Mililitro)" },
]

const ROOT_VALUE = "__root__"

interface BulkActionsBarProps {
	selectedNodes: BulkSelectedNode[]
	onDone: () => void
	onClear: () => void
}

type ActiveDialog = "move" | "unit" | "factor" | "delete" | null

export function BulkActionsBar({ selectedNodes, onDone, onClear }: BulkActionsBarProps) {
	const { folders } = useFolders()
	const { moveToFolder, setMeasureUnit, setCorrectionFactor, deleteNodes, isRunning, progress } = useBulkIngredientOps()

	const [active, setActive] = useState<ActiveDialog>(null)
	const [targetFolder, setTargetFolder] = useState<string | null>(null)
	const [unit, setUnit] = useState<string | null>(null)
	const [factor, setFactor] = useState("1.0")

	const factorId = useId()

	const ingredientNodes = useMemo(() => selectedNodes.filter((n) => n.type === "ingredient"), [selectedNodes])
	const folderCount = selectedNodes.length - ingredientNodes.length

	// Alvos de movimentação: exclui pastas selecionadas e seus descendentes (evita mover pasta para dentro de si mesma).
	const moveTargets = useMemo(() => {
		const all = folders ?? []
		const selectedFolderIds = new Set(selectedNodes.filter((n) => n.type === "folder").map((n) => n.id))
		if (selectedFolderIds.size === 0) return all

		const childrenByParent = new Map<string, string[]>()
		for (const f of all) {
			if (!f.parent_id) continue
			const list = childrenByParent.get(f.parent_id) ?? []
			list.push(f.id)
			childrenByParent.set(f.parent_id, list)
		}

		const excluded = new Set(selectedFolderIds)
		const stack = [...selectedFolderIds]
		while (stack.length > 0) {
			const id = stack.pop()
			if (!id) break
			for (const child of childrenByParent.get(id) ?? []) {
				if (!excluded.has(child)) {
					excluded.add(child)
					stack.push(child)
				}
			}
		}

		return all.filter((f) => !excluded.has(f.id))
	}, [folders, selectedNodes])

	const close = () => {
		if (isRunning) return
		setActive(null)
	}

	const afterApply = (result: { done: number; failed: number }, verb: string) => {
		if (result.failed > 0) toast.warning(`${result.done} ${verb}, ${result.failed} falharam`)
		else toast.success(`${result.done} ${result.done === 1 ? "item" : "itens"} ${verb}`)
		setActive(null)
		onDone()
	}

	const handleMove = async () => {
		const result = await moveToFolder(selectedNodes, targetFolder === ROOT_VALUE ? null : targetFolder)
		afterApply(result, "movidos")
	}

	const handleSetUnit = async () => {
		if (!unit) return
		const result = await setMeasureUnit(ingredientNodes, unit)
		afterApply(result, "atualizados")
	}

	const handleSetFactor = async () => {
		const value = Number(factor)
		if (!Number.isFinite(value) || value < 0) {
			toast.error("Fator de correção inválido")
			return
		}
		const result = await setCorrectionFactor(ingredientNodes, value)
		afterApply(result, "atualizados")
	}

	const handleDelete = async () => {
		const result = await deleteNodes(selectedNodes)
		afterApply(result, "excluídos")
	}

	const resolveFolderLabel = (value: string | null) => {
		if (value === ROOT_VALUE) return "Raiz (sem pasta)"
		return moveTargets.find((f) => f.id === value)?.description || "Sem nome"
	}

	return (
		<>
			{/* Barra flutuante */}
			<div className="sticky bottom-4 z-30 mx-auto w-fit max-w-full">
				<div className="flex flex-wrap items-center gap-2 rounded-full border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
					<Badge variant="secondary" className="gap-1">
						{selectedNodes.length} {selectedNodes.length === 1 ? "selecionado" : "selecionados"}
					</Badge>
					{folderCount > 0 && ingredientNodes.length > 0 && (
						<span className="text-xs text-muted-foreground">
							({folderCount} {folderCount === 1 ? "pasta" : "pastas"}, {ingredientNodes.length} {ingredientNodes.length === 1 ? "insumo" : "insumos"})
						</span>
					)}

					<div className="mx-1 h-5 w-px bg-border" />

					<Button
						variant="ghost"
						size="sm"
						className="gap-1.5"
						disabled={selectedNodes.length === 0}
						onClick={() => {
							setTargetFolder(null)
							setActive("move")
						}}
					>
						<FolderInput className="size-4" />
						Mover
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="gap-1.5"
						disabled={ingredientNodes.length === 0}
						onClick={() => {
							setUnit(null)
							setActive("unit")
						}}
					>
						<Ruler className="size-4" />
						Unidade
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="gap-1.5"
						disabled={ingredientNodes.length === 0}
						onClick={() => {
							setFactor("1.0")
							setActive("factor")
						}}
					>
						<Scale className="size-4" />
						Fator
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="gap-1.5 text-destructive hover:text-destructive"
						disabled={selectedNodes.length === 0}
						onClick={() => setActive("delete")}
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

			{/* Mover para pasta */}
			<Dialog open={active === "move"} onOpenChange={(o) => !o && close()}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Mover para pasta</DialogTitle>
						<DialogDescription>
							Mover {selectedNodes.length} {selectedNodes.length === 1 ? "item" : "itens"} para a pasta selecionada.
						</DialogDescription>
					</DialogHeader>
					<Field>
						<FieldLabel>Pasta de destino</FieldLabel>
						<Select value={targetFolder} onValueChange={setTargetFolder}>
							<SelectTrigger>
								<SelectValue placeholder="Selecione a pasta">{targetFolder ? resolveFolderLabel(targetFolder) : undefined}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ROOT_VALUE}>Raiz (sem pasta)</SelectItem>
								{moveTargets.map((f) => (
									<SelectItem key={f.id} value={f.id}>
										{f.description || "Sem nome"}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<DialogFooter>
						<Button variant="outline" onClick={close} disabled={isRunning}>
							Cancelar
						</Button>
						<Button onClick={handleMove} disabled={isRunning || targetFolder === null} className="gap-2">
							{isRunning && <Loader2 className="size-4 animate-spin" />}
							{isRunning && progress ? `${progress.completed}/${progress.total}` : "Mover"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Definir unidade de medida */}
			<Dialog open={active === "unit"} onOpenChange={(o) => !o && close()}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Definir unidade de medida</DialogTitle>
						<DialogDescription>
							Aplicar a {ingredientNodes.length} {ingredientNodes.length === 1 ? "insumo" : "insumos"}. Pastas selecionadas são ignoradas.
						</DialogDescription>
					</DialogHeader>
					<Field>
						<FieldLabel>Unidade</FieldLabel>
						<Select value={unit} onValueChange={setUnit}>
							<SelectTrigger>
								<SelectValue placeholder="Selecione">{unit ? (MEASURE_UNITS.find((u) => u.value === unit)?.label ?? unit) : undefined}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{MEASURE_UNITS.map((u) => (
									<SelectItem key={u.value} value={u.value}>
										{u.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<DialogFooter>
						<Button variant="outline" onClick={close} disabled={isRunning}>
							Cancelar
						</Button>
						<Button onClick={handleSetUnit} disabled={isRunning || !unit} className="gap-2">
							{isRunning && <Loader2 className="size-4 animate-spin" />}
							{isRunning && progress ? `${progress.completed}/${progress.total}` : "Aplicar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Definir fator de correção */}
			<Dialog open={active === "factor"} onOpenChange={(o) => !o && close()}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Definir fator de correção</DialogTitle>
						<DialogDescription>
							Aplicar a {ingredientNodes.length} {ingredientNodes.length === 1 ? "insumo" : "insumos"}. Pastas selecionadas são ignoradas.
						</DialogDescription>
					</DialogHeader>
					<Field>
						<FieldLabel htmlFor={factorId}>Fator de correção</FieldLabel>
						<Input id={factorId} type="number" step="0.0001" min="0" value={factor} onChange={(e) => setFactor(e.target.value)} placeholder="1.0000" />
					</Field>
					<DialogFooter>
						<Button variant="outline" onClick={close} disabled={isRunning}>
							Cancelar
						</Button>
						<Button onClick={handleSetFactor} disabled={isRunning} className="gap-2">
							{isRunning && <Loader2 className="size-4 animate-spin" />}
							{isRunning && progress ? `${progress.completed}/${progress.total}` : "Aplicar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Excluir em lote */}
			<AlertDialog open={active === "delete"} onOpenChange={(o) => !o && close()}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Excluir {selectedNodes.length} {selectedNodes.length === 1 ? "item" : "itens"}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							{folderCount > 0
								? "Pastas excluídas removem o agrupamento, mas seus insumos não são apagados em cascata. Esta ação não pode ser desfeita."
								: "Esta ação não pode ser desfeita."}
						</AlertDialogDescription>
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
