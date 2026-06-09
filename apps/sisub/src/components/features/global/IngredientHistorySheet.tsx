import { Clock, History, Loader2, User } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/cn"
import { computeIngredientDiff, summarizeDiff } from "@/lib/ingredient-diff"
import type { IngredientVersion } from "@/types/domain/ingredient-versions"

function formatDateTime(dateStr: string) {
	return new Date(dateStr).toLocaleString("pt-BR", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	})
}

interface IngredientHistorySheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	versions: IngredientVersion[] | undefined
	isLoading: boolean
	selectedVersionId: string | null
	onSelect: (versionId: string | null) => void
}

/**
 * Painel lateral (estilo Google Docs) com o histórico de alterações do insumo.
 * Cada item mostra data, autor e um resumo do que mudou em relação à versão anterior.
 * Selecionar uma versão coloca o formulário em modo preview com o diff pintado.
 */
export function IngredientHistorySheet({ open, onOpenChange, versions, isLoading, selectedVersionId, onSelect }: IngredientHistorySheetProps) {
	const sorted = versions ?? [] // já vem desc (mais recente primeiro)

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
				<SheetHeader className="border-b border-border px-5 py-4">
					<SheetTitle className="flex items-center gap-2">
						<History className="size-4" />
						Histórico de alterações
					</SheetTitle>
					<SheetDescription>
						{sorted.length === 0 ? "Nenhuma versão registrada" : sorted.length === 1 ? "1 versão registrada" : `${sorted.length} versões registradas`}
					</SheetDescription>
				</SheetHeader>

				{isLoading ? (
					<div className="flex flex-1 items-center justify-center">
						<Loader2 className="size-6 animate-spin text-muted-foreground" />
					</div>
				) : sorted.length === 0 ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
						<History className="size-7 text-muted-foreground" />
						<p className="text-sm text-muted-foreground">As alterações deste insumo aparecerão aqui conforme forem salvas.</p>
					</div>
				) : (
					<ScrollArea className="flex-1">
						<ol className="divide-y divide-border">
							{sorted.map((version, idx) => {
								const previous = sorted[idx + 1] // mais antigo
								const diff = computeIngredientDiff(previous?.snapshot ?? null, version.snapshot)
								const chips = summarizeDiff(diff)
								const isLatest = idx === 0
								const isSelected = selectedVersionId === version.id
								const isBaseline = !previous

								return (
									<li key={version.id}>
										<button
											type="button"
											onClick={() => onSelect(isSelected ? null : version.id)}
											className={cn("w-full text-left px-5 py-3.5 transition-colors hover:bg-muted/50", isSelected && "bg-primary/5 hover:bg-primary/5")}
										>
											<div className="flex items-center gap-2">
												<Badge variant={isLatest ? "default" : "outline"} className="text-xs">
													v{version.version_number}
												</Badge>
												{isLatest && (
													<Badge variant="secondary" className="text-xs">
														atual
													</Badge>
												)}
												{isSelected && (
													<Badge variant="secondary" className="ml-auto text-xs">
														visualizando
													</Badge>
												)}
											</div>

											<div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
												<span className="flex items-center gap-1.5">
													<Clock className="size-3 shrink-0" />
													{formatDateTime(version.created_at)}
												</span>
												<span className="flex items-center gap-1.5">
													<User className="size-3 shrink-0" />
													{version.changed_by_name ?? "Autor desconhecido"}
												</span>
											</div>

											{version.change_summary && <p className="mt-1.5 text-xs text-foreground/80">{version.change_summary}</p>}

											{isBaseline ? (
												<p className="mt-1.5 text-xs text-muted-foreground/70 italic">Versão inicial</p>
											) : chips.length > 0 ? (
												<div className="mt-2 flex flex-wrap gap-1">
													{chips.map((chip) => (
														<span key={chip} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
															{chip}
														</span>
													))}
												</div>
											) : (
												<p className="mt-1.5 text-xs text-muted-foreground/70 italic">Sem alterações detectadas</p>
											)}
										</button>
									</li>
								)
							})}
						</ol>
					</ScrollArea>
				)}
			</SheetContent>
		</Sheet>
	)
}
