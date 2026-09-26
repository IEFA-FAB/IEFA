import { useNavigate } from "@tanstack/react-router"
import { FilePen } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { useOpenDrafts } from "@/hooks/forms/useDraft"

/**
 * Rascunhos não salvos abertos nesta aba, de qualquer tela. O rascunho sobrevive a sair
 * da tela — sem este lembrete ele ficaria esquecido até o F5 o apagar.
 */
export function OpenDraftsMenu() {
	const drafts = useOpenDrafts()
	const navigate = useNavigate()
	const [open, setOpen] = useState(false)
	if (drafts.length === 0) return null
	const label = drafts.length === 1 ? "1 rascunho não salvo" : `${drafts.length} rascunhos não salvos`

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger render={<Button variant="ghost" size="sm" aria-label={label} />}>
				<span className="relative">
					<FilePen className="size-4" />
					<span aria-hidden className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-warning" />
				</span>
				<span className="hidden sm:inline">{drafts.length}</span>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80">
				<PopoverHeader>
					<PopoverTitle>{label}</PopoverTitle>
					<PopoverDescription>Ficam nesta aba até você salvar; recarregar a página os descarta.</PopoverDescription>
				</PopoverHeader>
				<ul className="space-y-1">
					{drafts.map((draft) => (
						<li key={draft.key}>
							{draft.href ? (
								// Navegação do router, nunca `<a href>`: recarregar a página apagaria o rascunho.
								<button
									type="button"
									onClick={() => {
										setOpen(false)
										navigate({ href: draft.href as string })
									}}
									className="flex w-full items-baseline justify-between gap-3 rounded-md p-2 text-left hover:bg-muted"
								>
									<span className="text-body truncate">{draft.title}</span>
									<span className="text-caption shrink-0 text-muted-foreground">
										{draft.changeCount} {draft.changeCount === 1 ? "alteração" : "alterações"}
									</span>
								</button>
							) : (
								<span className="flex items-baseline justify-between gap-3 p-2">
									<span className="text-body truncate">{draft.title}</span>
									<span className="text-caption shrink-0 text-muted-foreground">{draft.changeCount}</span>
								</span>
							)}
						</li>
					))}
				</ul>
			</PopoverContent>
		</Popover>
	)
}
