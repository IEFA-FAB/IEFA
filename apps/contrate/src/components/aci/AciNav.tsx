import type { ReactNode } from "react"
import { SectionHeader } from "@/components/alpha/SectionNav"

/**
 * Cabeçalho das telas da Plataforma ACI. As telas da ACI estão na barra lateral do
 * módulo; o console técnico (`/alpha/*`) é outro módulo, alcançado pelo seletor —
 * daqui não sai link para ele.
 */
export function AciNav({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
	return <SectionHeader eyebrow="Projeto α · Plataforma ACI" title={title} subtitle={subtitle} actions={actions} />
}
