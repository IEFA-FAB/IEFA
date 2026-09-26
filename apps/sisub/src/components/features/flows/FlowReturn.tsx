import { Link, useRouterState } from "@tanstack/react-router"
import { ArrowLeft, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { FlowOrigin } from "./FlowView"

/**
 * "Voltar ao fluxo" nas telas abertas a partir de um fluxo guiado.
 *
 * A origem chega no history state do link (nada vai para cookie ou armazenamento). Ela fica em
 * memória enquanto o usuário resolve a etapa, inclusive passando por outras telas (o wizard troca
 * de passo com navegação nova, e o state não viaja junto), e some ao voltar ao fluxo ou ao fechar.
 */
export function FlowReturn() {
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const incoming = useRouterState({ select: (s) => (s.location.state as { fromFlow?: FlowOrigin } | undefined)?.fromFlow })
	const [origin, setOrigin] = useState<FlowOrigin | null>(null)
	// Fluxo cujo atalho o usuário fechou: o `fromFlow` segue no history state da tela de chegada,
	// e sem isto o próximo render o traria de volta.
	const [dismissedHref, setDismissedHref] = useState<string | null>(null)

	// Ajustes durante o render (sem efeito): a origem nova substitui a guardada; voltar ao fluxo
	// encerra o atalho e libera o fechamento para a próxima ida.
	if (incoming && incoming.href !== origin?.href && incoming.href !== dismissedHref) setOrigin(incoming)
	if (pathname === (origin?.href ?? dismissedHref)) {
		if (origin) setOrigin(null)
		if (dismissedHref) setDismissedHref(null)
		return null
	}
	if (!origin) return null

	return (
		<div className="mb-4 flex items-center gap-1">
			<Button
				size="sm"
				variant="outline"
				nativeButton={false}
				render={
					<Link to={origin.href as never}>
						<ArrowLeft data-icon="inline-start" aria-hidden="true" />
						Voltar ao fluxo: {origin.label}
					</Link>
				}
			/>
			<Button
				size="icon-sm"
				variant="ghost"
				onClick={() => {
					setDismissedHref(origin.href)
					setOrigin(null)
				}}
				aria-label="Esconder atalho do fluxo"
			>
				<X aria-hidden="true" />
			</Button>
		</div>
	)
}
