import type { ReactNode } from "react"

interface PageHeaderProps {
	title: ReactNode
	description?: string
	/** Badge inline ao lado do título (ex.: versão, status). */
	badge?: ReactNode
	/** Ações da página, à direita do título. Filtro não vai aqui: filtro é do conteúdo. */
	children?: ReactNode
}

/**
 * Toolbar de página: senta no topo do conteúdo de cada rota protegida. O `AppShell` já provê
 * padding e largura; a página começa pelo header, sem seção extra.
 */
export function PageHeader({ title, description, badge, children }: PageHeaderProps) {
	return (
		<header className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<h1 className="text-heading leading-tight">{title}</h1>
					{badge}
				</div>
				{description && <p className="mt-0.5 max-w-prose text-body leading-snug text-muted-foreground">{description}</p>}
			</div>
			{children && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-px">{children}</div>}
		</header>
	)
}
