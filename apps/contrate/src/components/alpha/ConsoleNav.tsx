import type { ReactNode } from "react"
import { SectionHeader } from "./SectionNav"

/**
 * Cabeçalho das telas do console de calibração. As telas do console estão na barra
 * lateral do módulo; a Plataforma ACI, no seletor de módulo — daqui não sai link
 * para ela.
 */
export function ConsoleNav({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
	return <SectionHeader eyebrow="Projeto α · console interno" title={title} subtitle={subtitle} actions={actions} />
}
