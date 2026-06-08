import { Loader2, Replace } from "lucide-react"
import { useId, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { type BulkSelectedNode, useBulkIngredientOps } from "@/hooks/business/useBulkIngredientOps"
import { useIngredientsTree } from "@/services/IngredientsService"

interface BulkFindReplaceDialogProps {
	isOpen: boolean
	onClose: () => void
}

interface ReplaceMatch {
	node: BulkSelectedNode
	original: string
	newDescription: string
	count: number
}

/** Escapa o texto de busca (busca literal, não regex). */
function buildRegex(find: string, caseSensitive: boolean, wholeWord: boolean): RegExp | null {
	if (!find) return null
	const esc = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	const pattern = wholeWord ? `\\b${esc}\\b` : esc
	try {
		return new RegExp(pattern, caseSensitive ? "g" : "gi")
	} catch {
		return null
	}
}

const PREVIEW_LIMIT = 200

export function BulkFindReplaceDialog({ isOpen, onClose }: BulkFindReplaceDialogProps) {
	const { tree } = useIngredientsTree()
	const { replaceDescriptions, isRunning } = useBulkIngredientOps()

	const findId = useId()
	const replaceId = useId()
	const caseId = useId()
	const wordId = useId()
	const foldersId = useId()
	const ingredientsId = useId()

	const [find, setFind] = useState("")
	const [replace, setReplace] = useState("")
	const [caseSensitive, setCaseSensitive] = useState(false)
	const [wholeWord, setWholeWord] = useState(false)
	const [includeFolders, setIncludeFolders] = useState(true)
	const [includeIngredients, setIncludeIngredients] = useState(true)

	const matches = useMemo<ReplaceMatch[]>(() => {
		const re = buildRegex(find, caseSensitive, wholeWord)
		if (!re || !tree) return []

		const out: ReplaceMatch[] = []

		const consider = (node: BulkSelectedNode, original: string) => {
			const occurrences = (original.match(re) || []).length
			if (occurrences === 0) return
			const newDescription = original.replace(re, replace)
			if (newDescription === original) return
			out.push({ node, original, newDescription, count: occurrences })
		}

		if (includeFolders) {
			for (const f of tree.folders ?? []) {
				const original = f.description ?? ""
				consider({ id: f.id, type: "folder", label: original, data: f }, original)
			}
		}
		if (includeIngredients) {
			for (const ing of tree.ingredients ?? []) {
				const original = ing.description ?? ""
				consider({ id: ing.id, type: "ingredient", label: original, data: ing }, original)
			}
		}

		return out
	}, [find, replace, caseSensitive, wholeWord, includeFolders, includeIngredients, tree])

	const totalOccurrences = matches.reduce((sum, m) => sum + m.count, 0)

	const handleApply = async () => {
		if (matches.length === 0) return
		const result = await replaceDescriptions(matches.map((m) => ({ node: m.node, newDescription: m.newDescription })))
		if (result.failed > 0) {
			toast.warning(`${result.done} atualizados, ${result.failed} falharam`)
		} else {
			toast.success(`${result.done} ${result.done === 1 ? "item atualizado" : "itens atualizados"}`)
		}
		handleClose()
	}

	const handleClose = () => {
		if (isRunning) return
		setFind("")
		setReplace("")
		onClose()
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Replace className="size-4" />
						Localizar e substituir
					</DialogTitle>
					<DialogDescription>Substitui texto nas descrições de pastas e insumos. Pré-visualize antes de aplicar.</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 sm:grid-cols-2">
					<Field>
						<FieldLabel htmlFor={findId}>Localizar</FieldLabel>
						<Input id={findId} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Texto a localizar" autoFocus />
					</Field>
					<Field>
						<FieldLabel htmlFor={replaceId}>Substituir por</FieldLabel>
						<Input id={replaceId} value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Novo texto (vazio = remover)" />
					</Field>
				</div>

				<div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
					<label htmlFor={caseId} className="flex items-center gap-2 cursor-pointer">
						<Switch id={caseId} checked={caseSensitive} onCheckedChange={setCaseSensitive} size="sm" />
						Diferenciar maiúsculas
					</label>
					<label htmlFor={wordId} className="flex items-center gap-2 cursor-pointer">
						<Switch id={wordId} checked={wholeWord} onCheckedChange={setWholeWord} size="sm" />
						Palavra inteira
					</label>
					<label htmlFor={foldersId} className="flex items-center gap-2 cursor-pointer">
						<Switch id={foldersId} checked={includeFolders} onCheckedChange={setIncludeFolders} size="sm" />
						Pastas
					</label>
					<label htmlFor={ingredientsId} className="flex items-center gap-2 cursor-pointer">
						<Switch id={ingredientsId} checked={includeIngredients} onCheckedChange={setIncludeIngredients} size="sm" />
						Insumos
					</label>
				</div>

				{/* Resumo + Preview */}
				<div className="rounded-[var(--radius)] border">
					<div className="border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
						{find.trim() === "" ? (
							"Digite um texto para localizar"
						) : matches.length === 0 ? (
							"Nenhuma correspondência"
						) : (
							<>
								<strong className="text-foreground">{matches.length}</strong> {matches.length === 1 ? "item" : "itens"} ·{" "}
								<strong className="text-foreground">{totalOccurrences}</strong> {totalOccurrences === 1 ? "ocorrência" : "ocorrências"}
							</>
						)}
					</div>
					<div className="max-h-72 overflow-auto divide-y divide-border/50">
						{matches.slice(0, PREVIEW_LIMIT).map((m) => (
							<div key={`${m.node.type}-${m.node.id}`} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
								<span className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.node.type === "folder" ? "Pasta" : "Insumo"}</span>
								<span className="text-muted-foreground line-through">{m.original}</span>
								<span className="text-foreground">{m.newDescription}</span>
							</div>
						))}
						{matches.length > PREVIEW_LIMIT && (
							<div className="px-3 py-2 text-xs text-muted-foreground">+{matches.length - PREVIEW_LIMIT} não exibidos (serão aplicados)</div>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={handleClose} disabled={isRunning}>
						Cancelar
					</Button>
					<Button type="button" onClick={handleApply} disabled={isRunning || matches.length === 0} className="gap-2">
						{isRunning && <Loader2 className="size-4 animate-spin" />}
						Substituir {matches.length > 0 ? `(${matches.length})` : ""}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
