import { ChevronDown, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { cn } from "@/lib/cn"

interface CollapsibleItemCardProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	icon: ReactNode
	title: ReactNode
	description?: ReactNode
	/** Resumo extra só com o card fechado — aberto, o editor já mostra tudo. */
	details?: ReactNode
	/** Há rascunho não salvo deste item (ele sobrevive a fechar o card). */
	hasDraft?: boolean
	/** Nome usado nos rótulos acessíveis dos botões. */
	itemLabel: string
	onDelete?: () => void
	deleteLabel?: string
	disabled?: boolean
	/** O editor, montado só com o card aberto. */
	children: ReactNode
}

/**
 * Item de lista que abre o próprio editor no lugar, em vez de um dialog: a lista continua
 * à vista para comparar com os irmãos, e a página rola normalmente em qualquer altura de
 * tela. Um aberto por vez fica a cargo de quem controla `open`.
 */
export function CollapsibleItemCard({
	open,
	onOpenChange,
	icon,
	title,
	description,
	details,
	hasDraft,
	itemLabel,
	onDelete,
	deleteLabel = "Remover",
	disabled,
	children,
}: CollapsibleItemCardProps) {
	return (
		// A moldura é um div próprio: o primitivo Collapsible não recebe forma nem cor.
		<div className={cn("rounded-lg border border-border transition-shadow", open && "border-foreground/20 shadow-sm")}>
			<Collapsible open={open} onOpenChange={onOpenChange}>
				<Item>
					<ItemMedia variant="icon">{icon}</ItemMedia>
					<ItemContent className="min-w-0">
						<ItemTitle className="flex-wrap">
							{title}
							{hasDraft && !open && <Badge variant="warning">Rascunho não salvo</Badge>}
						</ItemTitle>
						{description && (
							<ItemDescription>
								<span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">{description}</span>
							</ItemDescription>
						)}
						{!open && details}
					</ItemContent>
					<ItemActions>
						<CollapsibleTrigger render={<Button variant="ghost" size="sm" disabled={disabled} aria-label={`${open ? "Fechar" : "Editar"} ${itemLabel}`} />}>
							{open ? "Fechar" : "Editar"}
							<ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
						</CollapsibleTrigger>
						{onDelete && (
							<Button variant="ghost" size="icon-sm" onClick={onDelete} disabled={disabled} aria-label={`${deleteLabel} ${itemLabel}`}>
								<Trash2 className="size-3.5" />
							</Button>
						)}
					</ItemActions>
				</Item>
				<CollapsibleContent>
					<div className="border-t border-border p-4">{children}</div>
				</CollapsibleContent>
			</Collapsible>
		</div>
	)
}
