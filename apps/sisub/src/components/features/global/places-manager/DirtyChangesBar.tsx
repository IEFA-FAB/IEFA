import { AlertTriangle, ChevronDown, Save, Trash2 } from "lucide-react"
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
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"
import type { PlacesDiff } from "@/types/domain/places"

interface DirtyChangesBarProps {
	diffs: PlacesDiff[]
	onSave: () => void
	onDiscard: () => void
	isSaving: boolean
}

export function DirtyChangesBar({ diffs, onSave, onDiscard, isSaving }: DirtyChangesBarProps) {
	const [expanded, setExpanded] = useState(false)

	if (diffs.length === 0) return null

	return (
		<section className="border border-warning/40 rounded-md bg-warning/5 overflow-hidden" aria-label="Alterações pendentes" aria-live="polite">
			<div className="flex items-center gap-3 px-4 py-2.5">
				<AlertTriangle className="size-4 text-warning flex-shrink-0" aria-hidden />

				<span className="text-sm font-medium text-foreground flex-1 min-w-0">
					{diffs.length === 1 ? "1 relação alterada" : `${diffs.length} relações alteradas`}
					<span className="text-muted-foreground font-normal"> — não salvo</span>
				</span>

				{/* Expand/collapse diff list */}
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setExpanded((v) => !v)}
					aria-expanded={expanded}
					className="text-muted-foreground hover:text-foreground"
				>
					<ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
					<span>{expanded ? "Ocultar" : "Ver detalhes"}</span>
				</Button>

				{/* Discard */}
				<AlertDialog>
					<AlertDialogTrigger
						render={
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-muted-foreground hover:text-destructive"
								disabled={isSaving}
								aria-label="Descartar alterações"
							/>
						}
					>
						<Trash2 className="size-3.5" />
						<span className="text-xs ml-1 hidden sm:inline">Descartar</span>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
							<AlertDialogDescription>
								{diffs.length === 1 ? "1 alteração de relação será perdida." : `${diffs.length} alterações de relação serão perdidas.`} Esta ação não pode ser
								desfeita.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancelar</AlertDialogCancel>
							<AlertDialogAction variant="destructive" onClick={onDiscard}>
								Descartar
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				{/* Save */}
				<Button size="sm" onClick={onSave} disabled={isSaving} className="h-7">
					<Save className="size-3.5" />
					<span className="ml-1.5">{isSaving ? "Salvando..." : "Salvar tudo"}</span>
				</Button>
			</div>

			{/* Expandable diff list */}
			{expanded && (
				<div className="border-t border-warning/20 px-4 py-2 flex flex-col gap-1 max-h-40 overflow-y-auto">
					{diffs.map((diff, i) => (
						<p key={i} className="text-xs text-muted-foreground leading-relaxed">
							<span className="font-medium text-foreground">·</span> {diff.humanReadable}
						</p>
					))}
				</div>
			)}
		</section>
	)
}
