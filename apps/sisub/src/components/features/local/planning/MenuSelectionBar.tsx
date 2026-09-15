import { Eraser, Replace, Trash2, Users, X } from "lucide-react"
import { useState } from "react"
import { RecipeSelector } from "@/components/features/local/planning/RecipeSelector"
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/**
 * Barra de ações da seleção múltipla do cardápio — mesmo desenho da das listagens de insumos
 * e preparações (flutuante, no rodapé).
 *
 * A seleção atravessa dias e refeições: o mesmo pax vai para o café de segunda e para a ceia
 * de domingo sem o usuário caminhar pelas abas.
 */
export function MenuSelectionBar({
	count,
	kitchenId,
	onSetHeadcount,
	onReplace,
	onRemove,
	onClear,
}: {
	count: number
	/** Escopo do seletor de preparação da substituição (null = catálogo global). */
	kitchenId: number | null
	onSetHeadcount: (headcount: number | null) => void
	onReplace: (recipeId: string) => void
	onRemove: () => void
	onClear: () => void
}) {
	const [headcountOpen, setHeadcountOpen] = useState(false)
	const [headcount, setHeadcount] = useState("")
	const [replaceOpen, setReplaceOpen] = useState(false)
	const [confirmRemove, setConfirmRemove] = useState(false)

	const parsed = Number.parseInt(headcount.trim(), 10)
	const headcountValid = Number.isFinite(parsed) && parsed > 0

	const label = count === 1 ? "preparação selecionada" : "preparações selecionadas"

	return (
		<>
			<div className="sticky bottom-4 z-30 mx-auto w-fit max-w-full">
				<div className="flex flex-wrap items-center gap-2 rounded-full border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
					<Badge variant="secondary" className="gap-1">
						{count} {label}
					</Badge>

					<div className="mx-1 h-5 w-px bg-border" />

					<Button
						variant="ghost"
						size="sm"
						className="gap-1.5"
						onClick={() => {
							setHeadcount("")
							setHeadcountOpen(true)
						}}
					>
						<Users className="size-4" />
						Comensais
					</Button>
					<Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onSetHeadcount(null)}>
						<Eraser className="size-4" />
						Limpar comensais
					</Button>
					<Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setReplaceOpen(true)}>
						<Replace className="size-4" />
						Substituir
					</Button>
					<Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setConfirmRemove(true)}>
						<Trash2 className="size-4" />
						Remover
					</Button>

					<div className="mx-1 h-5 w-px bg-border" />

					<Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Limpar seleção">
						<X className="size-4" />
					</Button>
				</div>
			</div>

			{/* Comensais das preparações selecionadas */}
			<Dialog open={headcountOpen} onOpenChange={setHeadcountOpen}>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Comensais das selecionadas</DialogTitle>
						<DialogDescription>
							O número vale como exceção para {count} {label}, por cima do efetivo da refeição.
						</DialogDescription>
					</DialogHeader>
					<Field>
						<FieldLabel htmlFor="bulk-headcount">Comensais</FieldLabel>
						<Input
							id="bulk-headcount"
							type="number"
							min="1"
							inputMode="numeric"
							value={headcount}
							placeholder="pax"
							onChange={(e) => setHeadcount(e.target.value)}
						/>
						<FieldDescription>Para voltar ao efetivo da refeição, use "Limpar comensais".</FieldDescription>
					</Field>
					<DialogFooter>
						<Button variant="outline" onClick={() => setHeadcountOpen(false)}>
							Cancelar
						</Button>
						<Button
							disabled={!headcountValid}
							onClick={() => {
								onSetHeadcount(parsed)
								setHeadcountOpen(false)
							}}
						>
							Aplicar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Substituir a preparação das selecionadas */}
			<RecipeSelector
				open={replaceOpen}
				onClose={() => setReplaceOpen(false)}
				kitchenId={kitchenId}
				selectedRecipeIds={[]}
				multiSelect={false}
				onSelect={(recipeIds) => {
					const [recipeId] = recipeIds
					if (recipeId) onReplace(recipeId)
					setReplaceOpen(false)
				}}
			/>

			<AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Remover {count} {label} do cardápio?
						</AlertDialogTitle>
						<AlertDialogDescription>As preparações saem deste cardápio. O catálogo não é afetado.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								onRemove()
								setConfirmRemove(false)
							}}
						>
							Remover
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
