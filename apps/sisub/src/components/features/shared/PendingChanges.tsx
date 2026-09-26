import { TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import type { DraftState } from "@/hooks/forms/useDraft"
import { draftStore } from "@/lib/drafts/draft-store"

interface PendingChangesProps {
	draft: DraftState
	/** Volta o formulário ao estado salvo. O rascunho é apagado junto. */
	onDiscard: () => void
	disabled?: boolean
}

/**
 * Fica ao lado do botão Salvar das telas de salvamento explícito: quantas alterações o
 * Salvar vai gravar e, ao abrir, quais — campo, valor salvo e valor novo.
 */
export function PendingChanges({ draft, onDiscard, disabled }: PendingChangesProps) {
	const { changes, restoredAt, stale } = draft
	if (changes.length === 0) return null
	const count = changes.length === 1 ? "1 alteração não salva" : `${changes.length} alterações não salvas`

	return (
		<Popover>
			<PopoverTrigger render={<Button type="button" variant="ghost" size="sm" disabled={disabled} />}>
				<span aria-hidden className="size-2 shrink-0 rounded-full bg-warning" />
				{count}
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80">
				<PopoverHeader>
					<PopoverTitle>{count}</PopoverTitle>
					<PopoverDescription>
						{restoredAt ? "Rascunho restaurado. " : ""}
						{draftStore.isPersistent()
							? "O rascunho fica só neste navegador até você salvar ou descartar, por até 7 dias sem uso."
							: "Este navegador não permite guardar o rascunho: recarregar a página o descarta."}
					</PopoverDescription>
				</PopoverHeader>
				{stale && (
					<p className="flex gap-2 rounded-md bg-warning/10 p-2 text-caption text-foreground">
						<TriangleAlert className="size-4 shrink-0 text-warning" />O registro foi alterado depois que você começou a editar. Salvar grava os valores abaixo
						por cima.
					</p>
				)}
				<ul className="max-h-64 space-y-2 overflow-y-auto">
					{changes.map((change) => (
						<li key={change.key} className="space-y-0.5">
							<p className="text-label">{change.label}</p>
							<p className="text-caption break-words">
								<span className="text-muted-foreground line-through">{change.from}</span>
								<span aria-hidden className="px-1.5 text-muted-foreground">
									→
								</span>
								<span className="sr-only"> passa a ser </span>
								<span className="text-foreground">{change.to}</span>
							</p>
						</li>
					))}
				</ul>
				<Button type="button" variant="outline" size="sm" onClick={onDiscard}>
					Descartar alterações
				</Button>
			</PopoverContent>
		</Popover>
	)
}
