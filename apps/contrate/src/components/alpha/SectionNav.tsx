import type { ReactNode } from "react"

/**
 * Cabeçalho de página dos módulos do Projeto α — console e Plataforma ACI.
 *
 * Já foi também a fileira de abas da seção. Saiu quando a navegação passou para a
 * barra lateral (`components/layout`): as mesmas telas em dois lugares, com dois
 * critérios de "ativo", é como os dois acabam discordando. Aqui fica o que é da
 * PÁGINA — eyebrow, título, subtítulo e as ações dela.
 *
 * O nome do arquivo ficou pela história; o componente é `SectionHeader`.
 */
export function SectionHeader({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle?: string; actions?: ReactNode }) {
	return (
		<header className="mb-8 border-border border-b pb-6 print:hidden">
			<p className="text-label mb-2 text-muted-foreground">{eyebrow}</p>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-semibold text-3xl tracking-tighter">{title}</h1>
					{subtitle ? <p className="mt-2 max-w-2xl text-muted-foreground text-sm">{subtitle}</p> : null}
				</div>
				{actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
			</div>
		</header>
	)
}
