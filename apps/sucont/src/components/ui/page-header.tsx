import type * as React from "react"
import { cn } from "#/lib/utils"

/**
 * Cabeçalho da página — o mesmo `PageHeader` do sisub, portado.
 *
 * Senta no topo do conteúdo, abaixo da barra fixa: `h1`, pílula de escopo,
 * uma linha de descrição e as ações da tela à direita. A barra fixa fica só
 * com a trilha — navegação — e o tema.
 *
 * Antes o `h1` morava no último item da trilha e a descrição era um parágrafo
 * solto em `.text-caption` sob a barra. Com as sete telas de análise iguais por
 * dentro, esse cabeçalho magro deixou de dizer ONDE o usuário está: o nome da
 * ferramenta estava no mesmo tamanho e cor do "Catálogo ›" ao lado.
 */
interface PageHeaderProps {
	title: React.ReactNode
	description?: string
	/** Pílula ao lado do título — escopo do RAC, status. */
	badge?: React.ReactNode
	/** Ações da tela, à direita. */
	children?: React.ReactNode
	className?: string
}

export function PageHeader({ title, description, badge, children, className }: PageHeaderProps) {
	return (
		<header
			data-slot="page-header"
			className={cn("flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4", className)}
		>
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<h1 className="text-display leading-tight text-foreground">{title}</h1>
					{badge}
				</div>
				{description && <p className="mt-1 max-w-prose text-body leading-snug text-muted-foreground">{description}</p>}
			</div>
			{children && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-px">{children}</div>}
		</header>
	)
}
