import type { ReactNode } from "react"
import { SectionNav, type SectionNavLink } from "./SectionNav"

const LINKS: readonly SectionNavLink[] = [
	{ to: "/alpha/fontes", label: "Fontes" },
	{ to: "/alpha/analise/nova", label: "Nova análise" },
	{ to: "/alpha/bancada", label: "Bancada" },
	{ to: "/aci", label: "Plataforma ACI", exact: true },
]

/** Cabeçalho do console de calibração. A gramática visual mora em `SectionNav`. */
export function ConsoleNav({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
	return <SectionNav eyebrow="Projeto α · console interno" title={title} subtitle={subtitle} links={LINKS} actions={actions} />
}
