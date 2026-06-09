import { Loader2, Replace } from "lucide-react"
import { useId, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useBulkRecipeOps } from "@/hooks/business/useBulkRecipeOps"
import { useRecipes } from "@/hooks/data/useRecipes"
import { usePersistentState } from "@/hooks/ui/usePersistentState"
import { buildSearchRegex } from "@/lib/text-search"

interface RecipesFindReplaceDialogProps {
	isOpen: boolean
	onClose: () => void
	/** Escopo da cozinha (igual ao RecipesManager) para listar as receitas candidatas. */
	kitchenId?: number | null
}

interface ReplaceMatch {
	id: string
	original: string
	newName: string
	count: number
	/** null = global; non-null = local. */
	kitchenId: number | null
}

const PREVIEW_LIMIT = 200

export function RecipesFindReplaceDialog({ isOpen, onClose, kitchenId }: RecipesFindReplaceDialogProps) {
	// Candidatas: todas as receitas do escopo, sem excluídas. Dedupe controlado pela query.
	const { data: recipes = [] } = useRecipes({ kitchen_id: kitchenId, includeDeleted: false })
	const { replaceNames, isRunning } = useBulkRecipeOps()

	const findId = useId()
	const replaceId = useId()
	const caseId = useId()
	const accentId = useId()
	const wordId = useId()
	const globalId = useId()
	const localId = useId()

	const [find, setFind] = useState("")
	const [replace, setReplace] = useState("")
	const [caseSensitive, setCaseSensitive] = usePersistentState("sisub:recipes:findReplace:caseSensitive", false)
	const [accentSensitive, setAccentSensitive] = usePersistentState("sisub:recipes:findReplace:accentSensitive", false)
	const [wholeWord, setWholeWord] = useState(false)
	const [includeGlobal, setIncludeGlobal] = useState(true)
	const [includeLocal, setIncludeLocal] = useState(true)
	const [applyingId, setApplyingId] = useState<string | null>(null)

	const matches = useMemo<ReplaceMatch[]>(() => {
		const re = buildSearchRegex(find, { caseSensitive, accentSensitive }, wholeWord)
		if (!re) return []

		const out: ReplaceMatch[] = []
		for (const r of recipes) {
			const isGlobal = r.kitchen_id == null
			if (isGlobal && !includeGlobal) continue
			if (!isGlobal && !includeLocal) continue

			const original = r.name ?? ""
			const occurrences = (original.match(re) || []).length
			if (occurrences === 0) continue
			const newName = original.replace(re, replace)
			if (newName === original || newName.trim() === "") continue
			out.push({ id: r.id, original, newName, count: occurrences, kitchenId: r.kitchen_id })
		}
		return out
	}, [find, replace, caseSensitive, accentSensitive, wholeWord, includeGlobal, includeLocal, recipes])

	const totalOccurrences = matches.reduce((sum, m) => sum + m.count, 0)

	const handleApply = async () => {
		if (matches.length === 0) return
		const result = await replaceNames(matches.map((m) => ({ id: m.id, newName: m.newName })))
		if (result.failed > 0) {
			toast.warning(`${result.done} atualizadas, ${result.failed} falharam`)
		} else {
			toast.success(`${result.done} ${result.done === 1 ? "preparação atualizada" : "preparações atualizadas"}`)
		}
	}

	const handleApplyOne = async (m: ReplaceMatch) => {
		setApplyingId(m.id)
		try {
			const result = await replaceNames([{ id: m.id, newName: m.newName }])
			if (result.failed > 0) {
				toast.warning("Falha ao substituir")
			} else {
				toast.success("Preparação atualizada")
			}
		} finally {
			setApplyingId(null)
		}
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
					<DialogDescription>Substitui texto nos nomes das preparações. Pré-visualize antes de aplicar.</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 sm:grid-cols-2">
					<Field>
						<FieldLabel htmlFor={findId}>Localizar</FieldLabel>
						<Input id={findId} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Texto a localizar" autoFocus />
					</Field>
					<Field>
						<FieldLabel htmlFor={replaceId}>Substituir por</FieldLabel>
						<Input id={replaceId} value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Novo texto" />
					</Field>
				</div>

				<div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
					<label htmlFor={caseId} className="flex items-center gap-2 cursor-pointer">
						<Switch id={caseId} checked={caseSensitive} onCheckedChange={setCaseSensitive} size="sm" />
						Diferenciar maiúsculas
					</label>
					<label htmlFor={accentId} className="flex items-center gap-2 cursor-pointer">
						<Switch id={accentId} checked={accentSensitive} onCheckedChange={setAccentSensitive} size="sm" />
						Diferenciar acentos
					</label>
					<label htmlFor={wordId} className="flex items-center gap-2 cursor-pointer">
						<Switch id={wordId} checked={wholeWord} onCheckedChange={setWholeWord} size="sm" />
						Palavra inteira
					</label>
					<label htmlFor={globalId} className="flex items-center gap-2 cursor-pointer">
						<Switch id={globalId} checked={includeGlobal} onCheckedChange={setIncludeGlobal} size="sm" />
						Globais
					</label>
					<label htmlFor={localId} className="flex items-center gap-2 cursor-pointer">
						<Switch id={localId} checked={includeLocal} onCheckedChange={setIncludeLocal} size="sm" />
						Locais
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
								<strong className="text-foreground">{matches.length}</strong> {matches.length === 1 ? "preparação" : "preparações"} ·{" "}
								<strong className="text-foreground">{totalOccurrences}</strong> {totalOccurrences === 1 ? "ocorrência" : "ocorrências"}
							</>
						)}
					</div>
					<div className="max-h-72 overflow-auto divide-y divide-border/50">
						{matches.slice(0, PREVIEW_LIMIT).map((m) => (
							<div key={m.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
								<div className="flex min-w-0 flex-col gap-0.5">
									<span className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.kitchenId == null ? "Global" : "Local"}</span>
									<span className="text-muted-foreground line-through">{m.original}</span>
									<span className="text-foreground">{m.newName}</span>
								</div>
								<Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1.5" disabled={isRunning} onClick={() => handleApplyOne(m)}>
									{applyingId === m.id ? <Loader2 className="size-3.5 animate-spin" /> : <Replace className="size-3.5" />}
									Substituir
								</Button>
							</div>
						))}
						{matches.length > PREVIEW_LIMIT && (
							<div className="px-3 py-2 text-xs text-muted-foreground">+{matches.length - PREVIEW_LIMIT} não exibidas (serão aplicadas)</div>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={handleClose} disabled={isRunning}>
						Fechar
					</Button>
					<Button type="button" onClick={handleApply} disabled={isRunning || matches.length === 0} className="gap-2">
						{isRunning && <Loader2 className="size-4 animate-spin" />}
						Substituir todos {matches.length > 0 ? `(${matches.length})` : ""}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
