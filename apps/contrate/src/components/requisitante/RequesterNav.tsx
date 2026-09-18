import type { ReactNode } from "react"
import { SectionHeader } from "@/components/alpha/SectionNav"

/** Eyebrow das telas do módulo Requisitante, com o escopo aberto (a OM, `todas` ou `minhas`). */
export function requesterEyebrow(scope: string): string {
	return `Projeto α · Requisitante · ${scope}`
}

/**
 * Cabeçalho das telas do módulo Requisitante. Como na ACI, a navegação fica na barra lateral
 * do módulo, e daqui não sai link para outro módulo.
 */
export function RequesterNav({ scope, title, subtitle, actions }: { scope: string; title: string; subtitle?: string; actions?: ReactNode }) {
	return <SectionHeader eyebrow={requesterEyebrow(scope)} title={title} subtitle={subtitle} actions={actions} />
}
