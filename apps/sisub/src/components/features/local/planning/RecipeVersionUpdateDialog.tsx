import { ArrowRight, CheckCircle2, GitCompareArrows } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import type { OutdatedRecipe } from "@/lib/recipe-versions"

/** Selo da versão do item quando ela não é a mais recente; nada quando já é. */
export function RecipeVersionBadge({ outdated }: { outdated: OutdatedRecipe | undefined }) {
	if (!outdated) return null
	const renamed = outdated.latest.name !== outdated.current.name ? ` ("${outdated.latest.name}")` : ""
	return (
		<Badge variant="warning" className="tabular-nums" title={`Versão desatualizada — a mais recente é a v${outdated.latest.version}${renamed}`}>
			v{outdated.current.version}
		</Badge>
	)
}

/**
 * Botão do topo do editor de cardápio + dialog que troca as preparações em versão antiga pela
 * mais recente. A troca vai para o rascunho do editor (`onApply`), que grava como qualquer outra
 * edição — auto-save onde houver, botão Salvar onde não.
 */
export function RecipeVersionUpdateButton({ outdated, onApply }: { outdated: OutdatedRecipe[]; onApply: (replacements: Map<string, string>) => void }) {
	const [open, setOpen] = useState(false)
	// Desmarcadas, e não marcadas: tudo começa selecionado sem precisar sincronizar com `outdated`.
	const [deselected, setDeselected] = useState<ReadonlySet<string>>(new Set())

	const selected = outdated.filter((o) => !deselected.has(o.current.id))

	const handleOpenChange = (next: boolean) => {
		if (next) setDeselected(new Set())
		setOpen(next)
	}

	const toggle = (recipeId: string, checked: boolean) => {
		setDeselected((prev) => {
			const next = new Set(prev)
			if (checked) next.delete(recipeId)
			else next.add(recipeId)
			return next
		})
	}

	const handleApply = () => {
		onApply(new Map(selected.map((o) => [o.current.id, o.latest.id])))
		setOpen(false)
	}

	return (
		<>
			<Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
				<GitCompareArrows className="size-4 sm:mr-2" />
				<span className="hidden sm:inline">Atualizar versões</span>
				{outdated.length > 0 && (
					<Badge variant="warning" className="ml-1.5 tabular-nums">
						{outdated.length}
					</Badge>
				)}
			</Button>

			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Atualizar versões das preparações</DialogTitle>
						<DialogDescription>
							Estas preparações foram editadas depois de entrarem no cardápio. Atualizar troca o item pela versão mais recente em todos os dias e refeições; se
							a refeição já tiver a versão nova, a antiga é removida para não duplicar. Dias já aplicados ao calendário não mudam.
						</DialogDescription>
					</DialogHeader>

					{outdated.length === 0 ? (
						<div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center">
							<CheckCircle2 className="size-6 text-success" />
							<p className="text-sm text-muted-foreground">Todas as preparações deste cardápio estão na versão mais recente.</p>
						</div>
					) : (
						<ul className="max-h-[60vh] space-y-2 overflow-y-auto">
							{outdated.map((o) => (
								<li key={o.current.id}>
									<div className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40">
										<Checkbox
											id={`recipe-version-${o.current.id}`}
											className="mt-0.5"
											checked={!deselected.has(o.current.id)}
											onCheckedChange={(checked) => toggle(o.current.id, checked)}
										/>
										<Label htmlFor={`recipe-version-${o.current.id}`} className="min-w-0 flex-1 flex-col items-stretch gap-1 font-normal">
											<div className="flex items-center gap-1.5">
												<span className="truncate text-sm text-muted-foreground">{o.current.name}</span>
												<Badge variant="outline" className="tabular-nums">
													v{o.current.version}
												</Badge>
											</div>
											<div className="flex items-center gap-1.5">
												<ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
												<span className="truncate text-sm">{o.latest.name}</span>
												<Badge variant="success" className="tabular-nums">
													v{o.latest.version}
												</Badge>
											</div>
										</Label>
										<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
											{o.usageCount} {o.usageCount === 1 ? "item" : "itens"}
										</span>
									</div>
								</li>
							))}
						</ul>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setOpen(false)}>
							{outdated.length === 0 ? "Fechar" : "Cancelar"}
						</Button>
						{outdated.length > 0 && (
							<Button type="button" disabled={selected.length === 0} onClick={handleApply}>
								Atualizar {selected.length} {selected.length === 1 ? "preparação" : "preparações"}
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
