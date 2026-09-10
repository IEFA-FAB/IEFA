import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

const LINKS = [
	{ to: "/aci", label: "Painel", exact: true },
	{ to: "/aci/nova", label: "Nova análise", exact: false },
	{ to: "/aci/chats", label: "Chats", exact: false },
	{ to: "/alpha/fontes", label: "Console técnico", exact: false },
] as const

/**
 * Cabeçalho da Plataforma ACI.
 *
 * Mesma gramática do console (`ConsoleNav`): aba ativa por sublinhado de 2px,
 * sem faixa lateral colorida nem cantos arredondados. O "Console técnico" leva
 * ao `/alpha/*` — a calibração continua lá, fora do fluxo do analista.
 */
export function AciNav({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
	return (
		<header className="mb-8 border-border border-b print:hidden">
			<p className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.12em]">Projeto α · Plataforma ACI</p>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-semibold text-3xl tracking-tighter">{title}</h1>
					{subtitle ? <p className="mt-2 max-w-2xl text-muted-foreground text-sm">{subtitle}</p> : null}
				</div>
				{actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
			</div>

			<nav className="-mb-px mt-6 flex gap-6">
				{LINKS.map((link) => (
					<Link
						key={link.to}
						to={link.to}
						activeOptions={{ exact: link.exact }}
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
