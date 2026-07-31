import { Link } from "@tanstack/react-router"

const LINKS = [{ to: "/alpha/fontes", label: "Fontes" }] as const

/**
 * Cabeçalho do console.
 *
 * Aba ativa é marcada por sublinhado de 2px na base — não por faixa lateral
 * colorida, proibida no monorepo, nem por cantos arredondados, proibidos no
 * portal (`STYLE_CONTRACT.md`).
 */
export function ConsoleNav({ title, subtitle }: { title: string; subtitle?: string }) {
	return (
		<header className="mb-8 border-border border-b">
			<p className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.12em]">Projeto α · console interno</p>
			<h1 className="font-semibold text-3xl tracking-tighter">{title}</h1>
			{subtitle ? <p className="mt-2 max-w-2xl text-muted-foreground text-sm">{subtitle}</p> : null}

			<nav className="-mb-px mt-6 flex gap-6">
				{LINKS.map((link) => (
					<Link
						key={link.to}
						to={link.to}
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
