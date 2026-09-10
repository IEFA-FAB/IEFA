import type { ReactNode } from "react"
import { SectionNav, type SectionNavLink } from "@/components/alpha/SectionNav"

const LINKS: readonly SectionNavLink[] = [
	{ to: "/aci", label: "Painel", exact: true },
	{ to: "/aci/nova", label: "Nova análise" },
	{ to: "/aci/chats", label: "Chats" },
	{ to: "/alpha/fontes", label: "Console técnico" },
]

/**
 * Cabeçalho da Plataforma ACI.
 *
 * "Console técnico" leva ao `/alpha/*` — a calibração continua lá, fora do
 * fluxo do analista.
 */
export function AciNav({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
	return <SectionNav eyebrow="Projeto α · Plataforma ACI" title={title} subtitle={subtitle} links={LINKS} actions={actions} />
}
