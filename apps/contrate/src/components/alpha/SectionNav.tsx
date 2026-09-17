import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

export interface SectionNavLink {
	to: string
	label: string
	/** Só marca ativo no caminho exato — para o item raiz de uma seção. */
	exact?: boolean
}

/**
 * Cabeçalho de seção do Projeto α — console e Plataforma ACI.
 *
 * Aba ativa é marcada por sublinhado de 2px na base — não por faixa lateral
 * colorida, proibida no monorepo, nem por cantos arredondados, proibidos no
 * portal (`STYLE_CONTRACT.md`). Uma implementação só: as duas seções têm o
 * mesmo contrato visual e mudá-lo em duas cópias é como elas divergem.
 */
export function SectionNav({
	eyebrow,
	title,
	subtitle,
	links,
	actions,
}: {
	eyebrow: string
	title: string
	subtitle?: string
	links: readonly SectionNavLink[]
	actions?: ReactNode
}) {
	return (
		<header className="mb-8 border-border border-b print:hidden">
			<p className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.12em]">{eyebrow}</p>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-semibold text-3xl tracking-tighter">{title}</h1>
					{subtitle ? <p className="mt-2 max-w-2xl text-muted-foreground text-sm">{subtitle}</p> : null}
				</div>
				{actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
			</div>

			<nav className="-mb-px mt-6 flex gap-6">
				{links.map((link) => (
					<Link
						key={link.to}
						to={link.to}
						activeOptions={{ exact: link.exact ?? false }}
						className="border-transparent border-b-2 pb-3 text-sm transition-colors hover:text-foreground data-[status=active]:border-foreground data-[status=active]:font-medium"
						activeProps={{ "data-status": "active" }}
					>
						{link.label}
					</Link>
				))}
			</nav>
		</header>
	)
}
