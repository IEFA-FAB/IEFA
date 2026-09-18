import type { ReactNode } from "react"
import { SectionHeader } from "@/components/alpha/SectionNav"

/**
 * Cabeçalho das telas da Plataforma ACI, com a OM aberta no eyebrow — a mesma OM da URL e
 * do seletor da barra. As telas da ACI estão na barra lateral do
 * módulo; o console técnico (`/alpha/*`) é outro módulo, alcançado pelo seletor —
 * daqui não sai link para ele.
 */
export function AciNav({ scope, title, subtitle, actions }: { scope?: string; title: string; subtitle?: string; actions?: ReactNode }) {
	return (
		<SectionHeader
			eyebrow={scope ? `Projeto α · Plataforma ACI · ${scope}` : "Projeto α · Plataforma ACI"}
			title={title}
			subtitle={subtitle}
			actions={actions}
		/>
	)
}
