import type * as React from "react"
import { cn } from "#/lib/utils"

/**
 * Cabeçalho de seção dentro de uma ferramenta: título, uma linha de descrição
 * e as ações daquela seção à direita.
 *
 * Existiam pelo menos seis desenhos para isto: disco de 48px com ícone
 * (`bg-muted`, `bg-tech-blue text-white`, `bg-surface-inverted` com borda
 * dourada e `shadow-lg`), `h2` em caixa alta com ícone colorido à esquerda,
 * título com `border-b-2` embaixo, e o `CardTitle` do primitivo. O que muda
 * de uma seção para outra é o texto; a hierarquia é a mesma — e é a do
 * `HubLayout`: o `h1` é da trilha, então toda seção de ferramenta é `h2`.
 *
 * Ícone é opcional e vai ao lado do título, no tamanho do texto. Não há disco:
 * um ícone de 28px dentro de um quadrado de 48px era a assinatura mais forte de
 * "outro produto" que restava depois da unificação da casca.
 */
interface SectionHeaderProps extends React.ComponentProps<"div"> {
	title: string
	description?: string
	icon?: React.ReactNode
	/** Ações da seção — segmentado, botão de copiar, filtro. */
	actions?: React.ReactNode
}

export function SectionHeader({ title, description, icon, actions, className, ...props }: SectionHeaderProps) {
	return (
		<div data-slot="section-header" className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)} {...props}>
			<div className="min-w-0">
				<h2 className="flex items-center gap-2 text-heading text-foreground [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground">
					{icon}
					{title}
				</h2>
				{description && <p className="mt-1 text-caption text-muted-foreground">{description}</p>}
			</div>
			{actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
		</div>
	)
}
